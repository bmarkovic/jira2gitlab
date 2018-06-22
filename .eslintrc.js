module.exports = {
  root: true,
  parser: 'babel-eslint',
  parserOptions: {
    sourceType: 'module'
  },
  // https://github.com/feross/standard/blob/master/RULES.md#javascript-standard-style
  extends: 'standard',
  plugins: [
  ],
  // add your custom rules here
  'rules': {
    // allow paren-less arrow functions
    'arrow-parens': 0,
    // allow async-await
    'generator-star-spacing': 0,
    // allow debugger during development
    'no-debugger': process.env.NODE_ENV === 'production' ? 2 : 0,
    "space-before-function-paren": 0,
    "yoda":0,
    "indent": 0,
    "prefer-promise-reject-errors":0,
    "padded-blocks": 0,
    "eqeqeq":0,
    "space-in-parens": 0,
    "curly": 0,
    "no-template-curly-in-string": 0
  }
}
