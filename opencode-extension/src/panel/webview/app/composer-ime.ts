export function shouldDeferComposerInput(isComposing: boolean, nativeIsComposing: boolean) {
  return isComposing || nativeIsComposing
}
