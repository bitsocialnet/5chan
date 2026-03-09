import { useMemo } from 'react';
import { useAccount } from '@bitsocialnet/bitsocial-react-hooks';
import { useSubplebbitField } from './use-stable-subplebbit';

interface AuthorPrivilegesProps {
  commentAuthorAddress: string;
  subplebbitAddress: string;
  postCid?: string;
}

const useAuthorPrivileges = ({ commentAuthorAddress, subplebbitAddress }: AuthorPrivilegesProps) => {
  const account = useAccount();
  const accountAuthorAddress = account?.author?.address;
  // Only subscribe to roles field to avoid rerenders from updatingState changes
  const roles = useSubplebbitField(subplebbitAddress, (subplebbit) => subplebbit?.roles);
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
