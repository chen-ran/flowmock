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
    nav: {
      label: '导航',
      open: '打开导航',
      close: '关闭导航',
      skip: '跳到正文',
      overview: '概览',
      corpus: '录制',
      cassettes: 'Cassette',
      scenarios: '场景',
      keys: 'Key 与目标',
      monitor: '实时监控',
      requests: '请求',
      settings: '设置',
      groups: {
        corpus: '语料',
        replay: '回放',
        monitor: '监控',
      },
    },
    logout: {
      label: '退出登录',
      title: '退出登录？',
      message: '此浏览器将清除会话，之后需要用管理密钥重新登录。',
      action: '退出登录',
    },
    settings: {
      description: '此浏览器的偏好设置，以及服务端的运行状态。',
      sections: {
        preferences: '偏好设置',
        server: '服务端',
      },
      language: {
        label: '语言',
        description: '保存在此浏览器中。',
      },
      appearance: '亮色与暗色跟随系统外观设置。',
      version: 'FlowMock 版本',
      access: {
        protected: '已启用管理密钥',
        protectedDescription: '管理 API 只接受会话或管理密钥本身。',
        open: '管理 API 未加保护',
        openDescription: '服务端未设置管理密钥，因此只监听本机回环地址。',
      },
      timeline: {
        persistent: '请求时间线保留 {{days, count}} 天，最多 {{entries, count}} 条请求',
        memory: '请求时间线仅保存在内存中',
        description: '通过 FLOWMOCK_TIMELINE_PERSIST、FLOWMOCK_TIMELINE_RETAIN_DAYS 与 FLOWMOCK_TIMELINE_MAX 设置。',
      },
      signOutDescription: '结束此浏览器的会话。',
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
