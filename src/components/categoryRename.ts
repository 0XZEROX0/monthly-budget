import { categoryIcon, ICON_CHOICES } from '../data/icons'
import { renameCategory, renameMoneyHolder } from '../data/rename'
import type { Backend, Kind, Settings } from '../data/types'
import { askForm, showAlert } from './dialog'
import { t } from '../i18n'

const iconField = (current: string) => ({ key: 'icon', label: t('Icon'), icons: [...new Set([current, ...ICON_CHOICES])], initial: current })

/** Asks for a category's name and icon. A new name moves past entries and plans with it; resolves with the name it ends up with, or null. */
export async function askEditCategory(backend: Backend, settings: Settings, kind: Kind, from: string): Promise<string | null> {
  const current = categoryIcon(from)
  const v = await askForm(t('A new name moves past entries and plans with it.'), [{ key: 'name', label: t('Name'), initial: from, placeholder: t('Category name') }, iconField(current)], {
    title: t('Edit {name}', { name: from }),
    ok: t('Save'),
  })
  const to = v?.name?.trim()
  if (!v || !to) return null
  if (to !== from && settings.categories[kind].includes(to)) return void showAlert(t("There's already a category called {name}.", { name: to })), null
  const icons = { ...settings.icons }
  delete icons[from]
  if (v.icon && v.icon !== categoryIcon(to)) icons[to] = v.icon
  const next = { ...settings, icons }
  const done = to === from ? backend.saveSettings(next) : renameCategory(backend, next, kind, from, to)
  done.catch((e: Error) => showAlert(t('Could not save: {error}', { error: e.message })))
  return to
}

/** Asks for a new category's name and icon; resolves with the settings that include it, or null. */
export async function askNewCategory(settings: Settings, kind: Kind): Promise<{ name: string; settings: Settings } | null> {
  const v = await askForm(kind === 'income' ? t("It's added to your income categories.") : t("It's added to your expense categories."), [{ key: 'name', label: t('Name'), placeholder: t('Category name') }, iconField('📦')], { title: kind === 'income' ? t('New income category') : t('New expense category') })
  const name = v?.name?.trim()
  if (!v || !name) return null
  const list = settings.categories[kind]
  const icons = { ...settings.icons }
  if (v.icon && v.icon !== categoryIcon(name)) icons[name] = v.icon
  return { name, settings: { ...settings, icons, categories: { ...settings.categories, [kind]: list.includes(name) ? list : [...list, name] } } }
}

/** Asks for an account's or debt's name and icon; a new name carries its entries and balances with it. */
export async function askEditHolder(backend: Backend, settings: Settings, what: 'account' | 'debt', from: string) {
  const current = categoryIcon(from)
  const v = await askForm(what === 'account' ? t('Past entries and balances move to the new name too.') : t('What you owe and past payments move to the new name too.'), [{ key: 'name', label: t('Name'), initial: from, placeholder: what === 'account' ? t('Account name') : t('Lender name') }, iconField(current)], {
    title: t('Edit {name}', { name: from }),
    ok: t('Save'),
  })
  const to = v?.name?.trim()
  if (!v || !to) return
  const taken = what === 'account' ? settings.accounts.some((a) => a.name === to) : settings.debts.some((d) => d.name === to)
  if (to !== from && taken) return void showAlert(what === 'account' ? t("There's already an account called {name}.", { name: to }) : t("There's already a debt called {name}.", { name: to }))
  const icons = { ...settings.icons }
  delete icons[from]
  if (v.icon && v.icon !== categoryIcon(to)) icons[to] = v.icon
  const next = { ...settings, icons }
  const done = to === from ? backend.saveSettings(next) : renameMoneyHolder(backend, next, what, from, to)
  done.catch((e: Error) => showAlert(t('Could not save: {error}', { error: e.message })))
}
