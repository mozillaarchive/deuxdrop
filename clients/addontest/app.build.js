({
    baseUrl: 'lib-src',
    dir: 'lib',
    optimize: 'none',
    paths: {
        'common': '../../../common',
        'rdcommon': '../../../common/lib/rdcommon',
        'rdservers': '../../../servers/lib/rdservers',
        'q': '../../../servers/node_modules/q/q',
        'api-utils': 'empty:',
        'chrome': 'empty:'
    },
    modules: [
        {
            name: 'main'
        }
    ]
})
