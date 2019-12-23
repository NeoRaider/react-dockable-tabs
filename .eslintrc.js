module.exports = {
	parser:	'@typescript-eslint/parser',
	plugins: [
		'react-hooks',
	],
	extends: [
		'plugin:react/recommended',
		'plugin:@typescript-eslint/recommended',
		'prettier/@typescript-eslint',
		'plugin:prettier/recommended',
	],
	parserOptions: {
		ecmaVersion: 2018,
		sourceType: 'module',
		ecmaFeatures: {
			jsx: true,
		},
	},
	rules: {
		'react/prop-types': [0],
		'react-hooks/rules-of-hooks': 'error',
		'react-hooks/exhaustive-deps': 'warn',
		'prettier/prettier': 'warn',
	},
	settings: {
		react: {
			version: 'detect',
		},
	},
};
