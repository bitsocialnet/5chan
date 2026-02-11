import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { autoUpdate, flip, FloatingFocusManager, offset, shift, useClick, useDismiss, useFloating, useId, useInteractions, useRole } from '@floating-ui/react';
import { useBlock } from '@plebbit/plebbit-react-hooks';
import styles from './post-menu-desktop.module.css';
import { getCommentMediaInfo } from '../../../lib/utils/media-utils';
import { copyShareLinkToClipboard, isValidURL, type ShareLinkType } from '../../../lib/utils/url-utils';
import { copyToClipboard } from '../../../lib/utils/clipboard-utils';
import { getBoardPath } from '../../../lib/utils/route-utils';
import { useDirectories } from '../../../hooks/use-directories';
import { isAllView, isCatalogView, isPostPageView, isSubscriptionsView } from '../../../lib/utils/view-utils';
import useHide from '../../../hooks/use-hide';
import { capitalize } from 'lodash';
import { PostMenuProps } from '../../../lib/utils/post-menu-props';

type CopyLinkButtonProps =
  | { cid: string; subplebbitAddress: string; linkType: 'thread'; onClose: () => void }
  | { subplebbitAddress: string; linkType: Exclude<ShareLinkType, 'thread'>; onClose: () => void; cid?: undefined };

const CopyLinkButton = ({ cid, subplebbitAddress, linkType, onClose }: CopyLinkButtonProps) => {
  const { t } = useTranslation();
  const directories = useDirectories();
  const boardIdentifier = getBoardPath(subplebbitAddress, directories);
  return (
    <div
      onClick={async () => {
        try {
          if (linkType === 'thread') {
            await copyShareLinkToClipboard(boardIdentifier, linkType, cid);
          } else {
            await copyShareLinkToClipboard(boardIdentifier, linkType);
          }
        } catch (error) {
          console.error('Failed to copy share link', error);
        } finally {
          onClose();
        }
      }}
    >
      <div className={styles.postMenuItem}>{t('copy_direct_link')}</div>
    </div>
  );
};

const CopyContentIdButton = ({ cid, onClose }: { cid: string; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <div
      onClick={async () => {
        try {
          await copyToClipboard(cid);
        } catch (error) {
          console.error('Failed to copy content id', error);
        } finally {
          onClose();
        }
      }}
    >
      <div className={styles.postMenuItem}>{t('copy_content_id')}</div>
    </div>
  );
};

const CopyUserIdButton = ({ address, onClose }: { address: string; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <div
      onClick={async () => {
        try {
          await copyToClipboard(address);
        } catch (error) {
          console.error('Failed to copy user id', error);
        } finally {
          onClose();
        }
      }}
    >
      <div className={styles.postMenuItem}>{t('copy_user_id')}</div>
    </div>
  );
};

const ImageSearchButton = ({ url, onClose }: { url: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const [isImageSearchMenuOpen, setIsImageSearchMenuOpen] = useState(false);

  const { refs, floatingStyles } = useFloating({
    placement: 'right-start',
    middleware: [flip(), shift({ padding: 10 })],
  });

  return (
    <div
      className={`${styles.postMenuItem} ${styles.dropdown}`}
      onMouseOver={() => setIsImageSearchMenuOpen(true)}
      onMouseLeave={() => setIsImageSearchMenuOpen(false)}
      ref={refs.setReference}
      onClick={onClose}
    >
      {capitalize(t('image_search'))} »
      {isImageSearchMenuOpen && (
        <div ref={refs.setFloating} style={floatingStyles} className={styles.dropdownMenu}>
          <a href={`https://lens.google.com/uploadbyurl?url=${url}`} target='_blank' rel='noreferrer'>
            <div className={styles.postMenuItem}>Google</div>
          </a>
          <a href={`https://www.yandex.com/images/search?img_url=${url}&rpt=imageview`} target='_blank' rel='noreferrer'>
            <div className={styles.postMenuItem}>Yandex</div>
          </a>
          <a href={`https://saucenao.com/search.php?url=${url}`} target='_blank' rel='noreferrer'>
            <div className={styles.postMenuItem}>SauceNAO</div>
          </a>
        </div>
      )}
    </div>
  );
};

const BlockUserButton = ({ address }: { address: string }) => {
  const { t } = useTranslation();
  const { blocked, unblock, block } = useBlock({ address });
  return (
    <div className={styles.postMenuItem} onClick={blocked ? unblock : block}>
      {blocked ? t('unblock_user') : t('block_user')}
    </div>
  );
};

const BlockBoardButton = ({ address }: { address: string }) => {
  const { t } = useTranslation();
  const { blocked, unblock, block } = useBlock({ address });
  return (
    <div className={styles.postMenuItem} onClick={blocked ? unblock : block}>
      {blocked ? t('unblock_board') : t('block_board')}
    </div>
  );
};

type PostMenuDesktopProps = {
  postMenu: PostMenuProps;
};

const PostMenuDesktop = ({ postMenu }: PostMenuDesktopProps) => {
  const { t } = useTranslation();
  const { authorAddress, cid, link, thumbnailUrl, linkWidth, linkHeight, postCid, subplebbitAddress } = postMenu || {};
  const commentMediaInfo = getCommentMediaInfo(link || '', thumbnailUrl || '', linkWidth ?? 0, linkHeight ?? 0);
  const { thumbnail, type, url } = commentMediaInfo || {};
  const [menuBtnRotated, setMenuBtnRotated] = useState(false);

  const { hidden, unhide, hide } = useHide({ cid: cid || '' });

  const location = useLocation();
  const params = useParams();
  const isInAllView = isAllView(location.pathname);
  const isInCatalogView = isCatalogView(location.pathname, params);
  const isInPostPageView = isPostPageView(location.pathname, params);
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, useParams());

  const { refs, floatingStyles, context } = useFloating({
    placement: 'bottom-start',
    open: menuBtnRotated,
    onOpenChange: setMenuBtnRotated,
    middleware: [offset({ mainAxis: isInCatalogView ? -2 : 6, crossAxis: isInCatalogView ? -1 : 5 }), flip({ fallbackAxisSideDirection: 'end' }), shift({ padding: 10 })],
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);
  const headingId = useId();

  const handleMenuClick = () => {
    if (cid) {
      setMenuBtnRotated((prev) => !prev);
    }
  };

  const handleClose = () => setMenuBtnRotated(false);

  return (
    <>
      <span className={isInCatalogView ? styles.postMenuBtnCatalogWrapper : styles.postMenuBtnWrapper} ref={refs.setReference} {...getReferenceProps()}>
        <span
          className={isInCatalogView ? styles.postMenuBtnCatalog : styles.postMenuBtn}
          title='Post menu'
          onClick={handleMenuClick}
          style={{ transform: menuBtnRotated && cid ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
      </span>
      {menuBtnRotated &&
        cid &&
        createPortal(
          <FloatingFocusManager context={context} modal={false}>
            <div className={styles.postMenu} ref={refs.setFloating} style={floatingStyles} aria-labelledby={headingId} {...getFloatingProps()}>
              {cid && subplebbitAddress && <CopyLinkButton cid={cid} subplebbitAddress={subplebbitAddress} linkType='thread' onClose={handleClose} />}
              {cid && <CopyContentIdButton cid={cid} onClose={handleClose} />}
              {authorAddress && <CopyUserIdButton address={authorAddress} onClose={handleClose} />}
              {!(isInPostPageView && postCid === cid) && (
                <div
                  className={styles.postMenuItem}
                  onClick={() => {
                    hidden ? unhide() : hide();
                    handleClose();
                  }}
                >
                  {hidden ? (postCid === cid ? t('unhide_thread') : t('unhide_post')) : postCid === cid ? t('hide_thread') : t('hide_post')}
                </div>
              )}
              {link && isValidURL(link) && (type === 'image' || type === 'gif' || thumbnail) && url && <ImageSearchButton url={url} onClose={handleClose} />}
              {authorAddress && <BlockUserButton address={authorAddress} />}
              {(isInAllView || isInSubscriptionsView) && subplebbitAddress && <BlockBoardButton address={subplebbitAddress} />}
            </div>
          </FloatingFocusManager>,
          document.body,
        )}
    </>
  );
};

export default memo(PostMenuDesktop);
