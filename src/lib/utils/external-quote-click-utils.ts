// A cross-board quote click waits for a search that can take minutes. It may navigate or report an
// error only while it is the latest quote click and the user has not left the page it was made on,
// even to come back. Its link can be gone by then (a same-board quote turns into a regular one once
// its number is found, a board row scrolls out of the virtualized list), so leaving is recorded here
// for every pending click rather than by the link.

interface PendingQuoteClick {
  fromUrl: string;
  leftPage: boolean;
}

const pendingQuoteClicks = new Set<PendingQuoteClick>();
let latestQuoteClick = 0;

export const startExternalQuoteClick = () => {
  const clickNumber = ++latestQuoteClick;
  const click: PendingQuoteClick = { fromUrl: window.location.href, leftPage: false };
  pendingQuoteClicks.add(click);

  return {
    isCurrent: () => clickNumber === latestQuoteClick && !click.leftPage && window.location.href === click.fromUrl,
    end: () => {
      pendingQuoteClicks.delete(click);
    },
  };
};

// Called after every navigation, once the URL shows the page the user went to.
export const markExternalQuoteClicksLeftPage = () => {
  pendingQuoteClicks.forEach((click) => {
    if (window.location.href !== click.fromUrl) {
      click.leftPage = true;
    }
  });
};
