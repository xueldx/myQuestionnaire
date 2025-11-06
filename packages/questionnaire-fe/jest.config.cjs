const path = require('path')

module.exports = {
  rootDir: __dirname,
  preset: path.resolve(__dirname, '../questionnaire-be/node_modules/ts-jest/presets/default'),
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.(t|j)sx?$': [
      path.resolve(__dirname, '../questionnaire-be/node_modules/ts-jest/dist/index.js'),
      {
        tsconfig: path.resolve(__dirname, './tsconfig.json'),
        diagnostics: false
      }
    ]
  }
}
