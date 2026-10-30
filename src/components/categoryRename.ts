import { renameCategory } from '../data/rename'
import type { Backend, Kind, Settings } from '../data/types'
import { askText, showAlert } from './dialog'

/** Asks for a category's new name and renames it everywhere; resolves with the new name, or null. */
export async function askRenameCategory(backend: Backend, settings: Settings, kind: Kind, from: string): Promise<string | null> {
  const to = (await askText('Past entries and plans move to the new name too.', { title: `Rename ${from}`, initial: from, ok: 'Rename', placeholder: 'Category name' }))?.trim()
  if (!to || to === from) return null
  if (settings.categories[kind].includes(to)) return void showAlert(`There's already a category called ${to}.`), null
  renameCategory(backend, settings, kind, from, to).catch((e: Error) => showAlert(`Could not rename: ${e.message}`))
  return to
}
