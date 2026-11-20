/**
 * 迁移自检：用真实索引（只读）验证 v1 → v2 不丢数据，并看看检索是否还正常。
 * 只 init + 搜索，不写盘。
 *
 * 用法：
 *   node test/check-live.mjs                      # 用 $DSH_HOME/local-library
 *   node test/check-live.mjs D:/some/library      # 或直接给目录
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

const fromArg = process.argv[2]
const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const root = fromArg || join(dshHome, 'local-library')

console.log('库目录:', root)
const { LibraryStore } = await import('../lib/store.js')
const store = new LibraryStore(root)
await store.init()

const items = store.items()
console.log('items:', items.length, 'folders:', store.folders().length)
console.log(
  'sample:',
  items.slice(0, 3).map((i) => `${i.name} | folder=${JSON.stringify(i.folderId)} | remark=${JSON.stringify(i.remark)}`)
)
for (const q of ['论文', '文献', '报告']) {
  const hits = await store.search(q)
  console.log(`search ${q} ->`, hits.length)
}
console.log('stats:', JSON.stringify(await store.stats()))
console.log('recent:', (await store.recent(3)).map((i) => i.name))
