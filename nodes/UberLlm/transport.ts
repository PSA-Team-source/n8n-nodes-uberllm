import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const API_BASE = 'https://api.uberllm.dev';
const CREDENTIAL = 'uberLlmApi';

interface FullResponse {
	statusCode: number;
	headers: IDataObject;
	body: unknown;
}

function errorMessage(body: unknown, statusCode: number): { message: string; code?: string } {
	if (body && typeof body === 'object') {
		const err = (body as IDataObject).error;
		if (err && typeof err === 'object') {
			const e = err as IDataObject;
			return {
				message: typeof e.message === 'string' ? e.message : `UberLLM answered HTTP ${statusCode}`,
				code: typeof e.code === 'string' ? e.code : undefined,
			};
		}
		if (typeof err === 'string') return { message: err };
		if (typeof (body as IDataObject).message === 'string') {
			return { message: (body as IDataObject).message as string };
		}
	}
	if (typeof body === 'string' && body.trim() !== '') return { message: body.slice(0, 500) };
	return { message: `UberLLM answered HTTP ${statusCode}` };
}

/**
 * One call to the UberLLM API with the node's credential. Errors come back as
 * a NodeApiError carrying UberLLM's own message (for example "Your balance
 * can't cover the job's maximum cost") and its error code.
 */
export async function apiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	headers?: IDataObject,
	itemIndex?: number,
): Promise<IDataObject> {
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL, {
		method,
		url: `${API_BASE}${path}`,
		body,
		headers: { Accept: 'application/json', ...(headers ?? {}) },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	})) as FullResponse;

	if (response.statusCode >= 400) {
		const { message, code } = errorMessage(response.body, response.statusCode);
		throw new NodeApiError(this.getNode(), (response.body ?? {}) as JsonObject, {
			message,
			description: code ? `UberLLM error code: ${code}` : undefined,
			httpCode: String(response.statusCode),
			itemIndex,
		});
	}
	return (response.body ?? {}) as IDataObject;
}

/**
 * Downloads a result file (video, image) as n8n binary data. Links on
 * api.uberllm.dev need the API key, so they go through the credential; any
 * other link is fetched as is.
 */
export async function downloadBinary(
	this: IExecuteFunctions,
	url: string,
	fileBase: string,
	fallbackMime: string,
	itemIndex: number,
): Promise<IBinaryData> {
	const absolute = url.startsWith('/') ? `${API_BASE}${url}` : url;
	const ours = absolute.startsWith(`${API_BASE}/`);
	const options = {
		method: 'GET' as IHttpRequestMethods,
		url: absolute,
		encoding: 'arraybuffer' as const,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	const response = (
		ours
			? await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL, options)
			: await this.helpers.httpRequest(options)
	) as FullResponse;

	if (response.statusCode >= 400) {
		let parsed: unknown = undefined;
		try {
			parsed = JSON.parse(Buffer.from(response.body as ArrayBuffer).toString('utf8'));
		} catch {
			parsed = undefined;
		}
		const { message, code } = errorMessage(parsed, response.statusCode);
		throw new NodeApiError(this.getNode(), (parsed ?? {}) as JsonObject, {
			message: `Could not download the file: ${message}`,
			description:
				code === 'artifact_expired'
					? 'Video files are kept about 3 hours and image links about 15 minutes. Download sooner, or send an upload link.'
					: code
						? `UberLLM error code: ${code}`
						: undefined,
			httpCode: String(response.statusCode),
			itemIndex,
		});
	}

	const contentType =
		(typeof response.headers['content-type'] === 'string'
			? (response.headers['content-type'] as string).split(';')[0].trim()
			: '') || fallbackMime;
	const ext =
		contentType.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov') || 'bin';
	return await this.helpers.prepareBinaryData(
		Buffer.from(response.body as ArrayBuffer),
		`${fileBase}.${ext}`,
		contentType,
	);
}
