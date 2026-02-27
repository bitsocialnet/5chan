const getShortAddress = (address: string): string => {
  if (!address) return '';
  if (address.includes('.')) return address;
  if (address.length < 20) return '';
  return address.slice(8, 20);
};

export default getShortAddress;
