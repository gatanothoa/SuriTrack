import { useLogisticsStore } from '../store/useLogisticsStore';

export function useCart() {
  const recipientEmail = useLogisticsStore((state) => state.recipientEmail);
  const setRecipientEmail = useLogisticsStore((state) => state.setRecipientEmail);
  const cartItems = useLogisticsStore((state) => state.cartItems);
  const setCartItems = useLogisticsStore((state) => state.setCartItems);
  const nextLeadNumber = useLogisticsStore((state) => state.nextLeadNumber);
  const setNextLeadNumber = useLogisticsStore((state) => state.setNextLeadNumber);

  return {
    recipientEmail,
    setRecipientEmail,
    cartItems,
    setCartItems,
    nextLeadNumber,
    setNextLeadNumber,
  };
}
