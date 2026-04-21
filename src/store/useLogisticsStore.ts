import { create } from 'zustand';
import type { CartItem, MaterialCategory, MaterialOption } from '../types/logistics';

type Updater<T> = T | ((previous: T) => T);

type LogisticsStore = {
  selectedCategory: MaterialCategory;
  selectedMaterialId: string;
  materials: MaterialOption[];
  recipientEmail: string;
  cartItems: CartItem[];
  nextLeadNumber: number;
  setSelectedCategory: (value: Updater<MaterialCategory>) => void;
  setSelectedMaterialId: (value: Updater<string>) => void;
  setMaterials: (value: Updater<MaterialOption[]>) => void;
  setRecipientEmail: (value: Updater<string>) => void;
  setCartItems: (value: Updater<CartItem[]>) => void;
  setNextLeadNumber: (value: Updater<number>) => void;
  resetLogisticsStore: () => void;
};

const resolveNext = <T,>(value: Updater<T>, previous: T): T => {
  if (typeof value === 'function') {
    return (value as (current: T) => T)(previous);
  }

  return value;
};

const initialState = {
  selectedCategory: 'bolsas' as MaterialCategory,
  selectedMaterialId: '',
  materials: [] as MaterialOption[],
  recipientEmail: '',
  cartItems: [] as CartItem[],
  nextLeadNumber: 1,
};

export const useLogisticsStore = create<LogisticsStore>((set) => ({
  ...initialState,
  setSelectedCategory: (value) =>
    set((state) => ({
      selectedCategory: resolveNext(value, state.selectedCategory),
    })),
  setSelectedMaterialId: (value) =>
    set((state) => ({
      selectedMaterialId: resolveNext(value, state.selectedMaterialId),
    })),
  setMaterials: (value) =>
    set((state) => ({
      materials: resolveNext(value, state.materials),
    })),
  setRecipientEmail: (value) =>
    set((state) => ({
      recipientEmail: resolveNext(value, state.recipientEmail),
    })),
  setCartItems: (value) =>
    set((state) => ({
      cartItems: resolveNext(value, state.cartItems),
    })),
  setNextLeadNumber: (value) =>
    set((state) => ({
      nextLeadNumber: resolveNext(value, state.nextLeadNumber),
    })),
  resetLogisticsStore: () => set(initialState),
}));
