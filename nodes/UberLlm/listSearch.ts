import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { apiRequest } from './transport';

// The live list from GET /v1/models?type=<kind>: only models that can be
// called right now, with their price per unit in the dropdown.
async function searchModels(
	this: ILoadOptionsFunctions,
	kind: 'chat' | 'image' | 'video',
	filter?: string,
): Promise<INodeListSearchResult> {
	const body = await apiRequest.call(this, 'GET', `/v1/models?type=${kind}`);
	const data = (Array.isArray(body.data) ? body.data : []) as IDataObject[];
	const needle = (filter ?? '').toLowerCase();
	const results = data
		.filter((m) => m.available !== false)
		.filter((m) => {
			if (!needle) return true;
			return `${m.id} ${m.display_name ?? ''}`.toLowerCase().includes(needle);
		})
		.map((m) => {
			const id = String(m.id);
			const pricing = (m.pricing ?? {}) as IDataObject;
			let price = '';
			if (typeof pricing.usd === 'number' && typeof pricing.unit === 'string') {
				price = ` · $${pricing.usd} per ${pricing.unit}`;
			} else if (typeof pricing.input_usd === 'number' && typeof pricing.output_usd === 'number') {
				price = ` · $${pricing.input_usd} in / $${pricing.output_usd} out per 1M tokens`;
			}
			const label = m.display_name ? `${m.display_name} (${id})` : id;
			return { name: `${label}${price}`, value: id, url: `https://uberllm.dev/models/${id}` };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
	return { results };
}

export async function searchChatModels(this: ILoadOptionsFunctions, filter?: string) {
	return await searchModels.call(this, 'chat', filter);
}

export async function searchImageModels(this: ILoadOptionsFunctions, filter?: string) {
	return await searchModels.call(this, 'image', filter);
}

export async function searchVideoModels(this: ILoadOptionsFunctions, filter?: string) {
	return await searchModels.call(this, 'video', filter);
}
