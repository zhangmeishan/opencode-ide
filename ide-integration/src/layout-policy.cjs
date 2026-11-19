exports.shouldInitialize = function shouldInitialize(enabled, savedVersion) {
  return enabled && savedVersion !== 3
}

exports.defaultLayout = function defaultLayout() {
  return { orientation: 0, groups: [{ size: 1 }] }
}

exports.requiresSplit = function requiresSplit(groupCount) {
  return groupCount < 2
}

exports.resultOpenOptions = function resultOpenOptions() {
  return { viewColumn: -1, preview: false, preserveFocus: true }
}
