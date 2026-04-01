import { create } from 'zustand'

export interface Command {
  id: string
  label: string
  shortcut?: string
  category: string
  action: () => void
}

interface CommandPaletteState {
  isOpen: boolean
  search: string
  open: () => void
  close: () => void
  setSearch: (s: string) => void
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  search: '',
  open: () => set({ isOpen: true, search: '' }),
  close: () => set({ isOpen: false, search: '' }),
  setSearch: (search) => set({ search }),
}))
