require('@rushstack/eslint-patch/modern-module-resolution');
module.exports = {
	extends: ['plugin:@secoya/orbit/nodeLibrary'],
	parserOptions: {
		tsconfigRootDir: __dirname,
	},
	rules: {
		originalKeywordKind: 0,
	},
};
