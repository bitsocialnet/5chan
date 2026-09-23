import { useMemo } from 'react';
import { useActiveAccountField } from './use-active-account-field';
import { useCommunityField } from './use-stable-community';

interface AuthorPrivilegesProps {
  commentAuthorAddress: string;
  communityAddress?: string;
  postCid?: string;
}

const useAuthorPrivileges = ({ commentAuthorAddress, communityAddress }: AuthorPrivilegesProps) => {
  const accountAuthorAddress = useActiveAccountField((account) => account?.author?.address);
  // Only subscribe to roles field to avoid rerenders from updatingState changes
  const roles = useCommunityField(communityAddress, (community) => community?.roles);
  const { isCommentAuthorMod, isAccountMod, isAccountCommentAuthor, commentAuthorRole, accountAuthorRole } = useMemo(() => {
    const commentAuthorRole = roles?.[commentAuthorAddress]?.role;
    const isCommentAuthorMod = commentAuthorRole === 'admin' || commentAuthorRole === 'owner' || commentAuthorRole === 'moderator';
    const accountAuthorRole = roles?.[accountAuthorAddress]?.role;
    const isAccountMod = accountAuthorRole === 'admin' || accountAuthorRole === 'owner' || accountAuthorRole === 'moderator';

    const isAccountCommentAuthor = accountAuthorAddress === commentAuthorAddress;

    return { isCommentAuthorMod, isAccountMod, isAccountCommentAuthor, commentAuthorRole, accountAuthorRole };
  }, [roles, commentAuthorAddress, accountAuthorAddress]);

  return { isCommentAuthorMod, isAccountMod, isAccountCommentAuthor, commentAuthorRole, accountAuthorRole };
};

export default useAuthorPrivileges;
