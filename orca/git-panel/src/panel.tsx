// 面板入口：保持极薄。
// Orca 给「单次转译请求」2s 预算，且 worker 是冷启动的——入口文件若本身很大，
// 冷启动开销会算在它头上，实机直接报「took over the 2000 ms transpile budget」。
// 逻辑全部放在 app.tsx 及其拆出的模块里，这些是热 worker 上的后续请求。

export { setup } from './app'
export { App as default } from './app'
