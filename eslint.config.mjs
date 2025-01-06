import globals from "globals";
import babelParser from "@babel/eslint-parser";

export default [{
    ignores: ["!**/.eslintrc.js", "eslint.config.mjs"],
}, {
    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.webextensions,
        },

        // This is for a workaround to avoid parsing error around static properties defined in class definitions.
        // See also: https://stackoverflow.com/questions/42701440/eslint-parsing-error-unexpected-token-error-for-assigned-fat-arrow-prop
        parser: babelParser,
        parserOptions: {
            requireConfigFile: false,
        },
        ecmaVersion: 2020,
        sourceType: "script",
    },

    rules: {
        "no-const-assign": "error",

        "prefer-const": ["warn", {
            destructuring: "any",
            ignoreReadBeforeAssign: false,
        }],

        indent: ["warn", 2, {
            SwitchCase: 1,
            MemberExpression: 1,

            CallExpression: {
                arguments: "first",
            },

            VariableDeclarator: {
                var: 2,
                let: 2,
                const: 3,
            },
        }],

        "no-underscore-dangle": ["warn", {
            allowAfterThis: true,
        }],

        quotes: ["warn", "single", {
            avoidEscape: true,
            allowTemplateLiterals: true,
        }],

        "no-unused-expressions": "error",
        "no-unused-labels": "error",

        "no-undef": ["error", {
            typeof: true,
        }],

        "no-unused-vars": ["warn", {
            vars: "all",
            args: "after-used",
            argsIgnorePattern: "^_",
            caughtErrors: "all",
            caughtErrorsIgnorePattern: "^_",
        }],

        "no-use-before-define": ["error", {
            functions: false,
            classes: true,
        }],
    },
}];