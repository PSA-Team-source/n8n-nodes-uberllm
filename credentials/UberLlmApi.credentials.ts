import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class UberLlmApi implements ICredentialType {
	name = 'uberLlmApi';

	displayName = 'UberLLM API';

	icon: Icon = { light: 'file:../icons/uberllm.svg', dark: 'file:../icons/uberllm.dark.svg' };

	documentationUrl =
		'https://github.com/PSA-Team-source/n8n-nodes-uberllm?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your UberLLM key (starts with ull-). Make one at https://uberllm.dev/dashboard/keys.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.uberllm.dev',
			url: '/v1/balance',
			method: 'GET',
		},
	};
}
