import { categoryIcon, ICON_CHOICES } from '../data/icons'
import { renameCategory } from '../data/rename'
import type { Backend, Kind, Settings } from '../data/types'
import { askForm, showAlert } from './dialog'

const iconField = (current: string) => ({ key: 'icon', label: 'Icon', icons: [...new Set([current, ...ICON_CHOICES])], initial: current })

/** Asks for a category's name and icon. A new name moves past entries and plans with it; resolves with the name it ends up with, or null. */
export async function askEditCategory(backend: Backend, settings: Settings, kind: Kind, from: string): Promise<string | null> {
  const current = categoryIcon(from)
  const v = await askForm('A new name moves past entries and plans with it.', [{ key: 'name', label: 'Name', initial: from, placeholder: 'Category name' }, iconField(current)], {
    title: `Edit ${from}`,
    ok: 'Save',
  })
  const to = v?.name?.trim()
  if (!v || !to) return null
  if (to !== from && settings.categories[kind].includes(to)) return void showAlert(`There's already a category called ${to}.`), null
  const icons = { ...settings.icons }
  delete icons[from]
  if (v.icon && v.icon !== categoryIcon(to)) icons[to] = v.icon
  const next = { ...settings, icons }
  const done = to === from ? backend.saveSettings(next) : renameCategory(backend, next, kind, from, to)
  done.catch((e: Error) => showAlert(`Could not save: ${e.message}`))
  return to
}

/** Asks for a new category's name and icon; resolves with the settings that include it, or null. */
export async function askNewCategory(settings: Settings, kind: Kind): Promise<{ name: string; settings: Settings } | null> {
  const v = await askForm(`It's added to your ${kind} categories.`, [{ key: 'name', label: 'Name', placeholder: 'Category name' }, iconField('📦')], { title: `New ${kind} category` })
  const name = v?.name?.trim()
  if (!v || !name) return null
  const list = settings.categories[kind]
  const icons = { ...settings.icons }
  if (v.icon && v.icon !== categoryIcon(name)) icons[name] = v.icon
  return { name, settings: { ...settings, icons, categories: { ...settings.categories, [kind]: list.includes(name) ? list : [...list, name] } } }
}
