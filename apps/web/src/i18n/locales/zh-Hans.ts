const zhHans = {
  translation: {
    app: {
      title: 'FlowMock',
      documentTitle: '{{title}} | FlowMock',
    },
    auth: {
      login: {
        title: '登录',
        adminKey: '管理密钥',
        adminKeyPlaceholder: '服务端的管理密钥',
        submit: '登录',
        keyRequired: '请输入管理密钥。',
        invalidKey: '这不是服务端的管理密钥。',
        rateLimited: '失败次数过多，请一分钟后再试。',
        unreachable: 'FlowMock 没有响应，请确认服务端正在运行。',
        failed: '登录失败。',
        hint: '管理密钥即启动服务端时设置的 <variable>FLOWMOCK_ADMIN_KEY</variable>。',
      },
    },
    common: {
      language: '语言',
      loading: '加载中…',
      errors: {
        refresh: '刷新',
        back: '返回',
        title: '错误',
        unexpectedTitle: '出现错误',
        unexpectedDescription: '发生了意外错误',
        notFound: '找不到请求的页面',
      },
    },
  },
} as const;

export default zhHans;
