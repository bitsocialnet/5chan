export const hasModQueueAccessRole = (role?: string): boolean => role === 'admin' || role === 'owner' || role === 'moderator';

interface BoardModQueueAccessArgs {
  boardAddress?: string;
  accountCommunityAddresses: string[];
  accountRole?: string;
}

export const canAccessBoardModQueue = ({ boardAddress, accountCommunityAddresses, accountRole }: BoardModQueueAccessArgs): boolean => {
  if (hasModQueueAccessRole(accountRole)) {
    return true;
  }

  if (!boardAddress) {
    return accountCommunityAddresses.length > 0;
  }

  return false;
};
