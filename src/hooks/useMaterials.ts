import { useLogisticsStore } from '../store/useLogisticsStore';

export function useMaterials() {
  const selectedCategory = useLogisticsStore((state) => state.selectedCategory);
  const setSelectedCategory = useLogisticsStore((state) => state.setSelectedCategory);
  const selectedMaterialId = useLogisticsStore((state) => state.selectedMaterialId);
  const setSelectedMaterialId = useLogisticsStore((state) => state.setSelectedMaterialId);
  const materials = useLogisticsStore((state) => state.materials);
  const setMaterials = useLogisticsStore((state) => state.setMaterials);

  return {
    selectedCategory,
    setSelectedCategory,
    selectedMaterialId,
    setSelectedMaterialId,
    materials,
    setMaterials,
  };
}
