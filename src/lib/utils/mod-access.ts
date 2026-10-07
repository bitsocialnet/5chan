export const hasModQueueAccessRole = (role?: string): boolean => role === 'admin' || role === 'owner' || role === 'moderator';

// pkc-js accepts a remote community edit only from the owner or an admin; moderators cannot edit board settings.
// The node that hosts the board edits it locally, so its operator can edit regardless of role.
export const canEditBoardSettings = (role: string | undefined, isHostedOnConnectedNode: boolean): boolean =>
  isHostedOnConnectedNode || role === 'owner' || role === 'admin';

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
