// See ./en.ts. Values are taken from Floway's zh-Hans locale (MIT).
const zhHans = {
  translation: {
    ui: {
      common: {
        on: '开',
        off: '关',
        cancel: '取消',
        dismiss: '关闭',
        noOptions: '无可选项',
        noSuggestions: '无建议',
      },
      discard: {
        title: '放弃未保存的更改？',
        message: '该表单仍有尚未保存的修改。',
        keep: '继续编辑',
        discard: '放弃',
      },
      copy: {
        action: '复制',
        copied: '已复制',
        failed: '复制失败',
      },
      bodyViewer: {
        options: '正文选项',
        find: '搜索正文',
        fold: '折叠 JSON',
        unfold: '全部展开',
        wrap: '自动换行',
      },
      chartSeries: {
        all: '显示全部序列',
        invert: '反选序列',
        none: '隐藏全部序列',
        toggleHint: '点击切换。Shift 点击或双击可单独显示。',
      },
    },
  },
} as const;

export default zhHans;
