import { useEffect } from 'react';
import { HashLink } from 'react-router-hash-link';
import { Footer, HomeLogo } from '../home';
import styles from './faq.module.css';

const FAQ = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'FAQ - 5chan';
  }, []);

  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        <HomeLogo />
        <div className={`${styles.box} ${styles.infoBox}`}>
          <div className={styles.boxBar}>
            <h2>Frequently Asked Questions</h2>
          </div>
          <div className={styles.boxContent}>
            Welcome to 5chan's <strong>F</strong>requently <strong>A</strong>sked <strong>Q</strong>uestions page. After reading the FAQ, be sure to familiarize yourself
            with the <a href='/rules'>Rules</a>!
          </div>
        </div>
        <div className={styles.columns}>
          <div className={`${styles.box} ${styles.leftBox}`}>
            <div className={styles.boxBar}>
              <h2>Questions</h2>
            </div>
            <div className={styles.boxContent}>
              <ul className={styles.list}>
                <li>
                  <strong>
                    <HashLink to='#basics'>Basics</HashLink>
                  </strong>
                  <ul>
                    <li>
                      <HashLink to='#what5chan'>What is 5chan?</HashLink>
                    </li>
                    <ul>
                      <li>
                        <HashLink to='#howaccess'>How do I access the boards?</HashLink>
                      </li>
                    </ul>
                    <li>
                      <HashLink to='#whatbasics'>What should I know before I post?</HashLink>
                    </li>
                    <ul>
                      <li>
                        <HashLink to='#postanon'>How do I post anonymously?</HashLink>
                      </li>
                      <li>
                        <HashLink to='#register'>Can I register a username?</HashLink>
                      </li>
                      <li>
                        <HashLink to='#howimage'>How do I post an image?</HashLink>
                      </li>
                      <li>
                        <HashLink to='#uploadimage'>Can I upload an image?</HashLink>
                      </li>
                      <li>
                        <HashLink to='#postimage'>Must I post an image?</HashLink>
                      </li>
                      <li>
                        <HashLink to='#replyimage'>Can I reply with an image?</HashLink>
                      </li>
                      <li>
                        <HashLink to='#quote'>How do I quote somebody?</HashLink>
                      </li>
                      <li>
                        <HashLink to='#spoiler'>Can I mark a submission as a spoiler?</HashLink>
                      </li>
                    </ul>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
          <div className={`${styles.box} ${styles.rightBox}`}>
            <div className={styles.boxBar}>
              <h2 id='basics'>Basics</h2>
            </div>
            <div className={styles.boxContent}>
              <dl>
                <dt className={styles.first} id='what5chan'>
                  What is 5chan?
                </dt>
                <dd>
                  5chan is a serverless, adminless, decentralized imageboard where anyone can create and own unlimited boards. All data comes from the Bitsocial protocol,
                  it's all text including links from which media is embedded, shared peer-to-peer. Users do not need to register an account before participating in the
                  community.
                </dd>
                <dt id='howaccess'>How do I access the boards?</dt>
                <dd>
                  Anyone can access any board at a any time by simply knowing its address. Paste it in the search box, located in the homepage or at the top of the board
                  pages. Hit enter, and you will connect peer-to-peer to the board. Each board is completely independent and moderates itself, the board owner can do
                  whatever they want with it.
                </dd>
                <dt id='whatbasics'>What should I know before I post?</dt>
                <dd>
                  Please remember to read the rules and guidelines of whatever board you decide to post to. Each board is completely independent and has its own rules and
                  guidelines, as there are no global admins nor global rules.
                </dd>
                <dt id='postanon'>How do I post anonymously?</dt>
                <dd>
                  To post as "Anonymous", simply do not fill in the [Name] field when submitting content.
                  <br />
                  <br />
                  5chan uses the Bitsocial protocol to function, which does not leak IP addresses of people who post. When you post on 5chan, no board admin can know your
                  IP address, nor can the app itself, which is just static HTML. However, the Bitsocial protocol is not fully anonymous, it uses IPFS, which means your IP
                  address is part of a public P2P swarm, similarly to how BitTorrent works.
                </dd>
                <dt id='register'>Can I register a username?</dt>
                <dd>
                  You already have one, it's automatically generated by the app and you can find it in the settings. It's the address of your generated account file, and
                  you can change it to something readable (e.g., "myname.eth") by purchasing a crypto domain like ENS (Ethereum Name Service) and resolving your account
                  address with it.
                  <br />
                  <br />
                  You can also edit the display name associated with your account at any time in the settings or directly in the post form. The name you choose will be
                  reused across threads until you change it again.
                </dd>
                <dt id='howimage'>How do I post an image?</dt>
                <dd>
                  You need a link to the image, ideally using an image hosting service, like Imgur or catbox.moe. Paste the link to the image in the [Link] field when
                  submitting content. 5chan will attempt to load the media from the link and show its type next to the [Link] field. If the link type is "webpage", the
                  link is not an image, and you should try another link.
                  <br />
                  <br />
                  You can also post videos, audios and gifs by pasting their direct links. 5chan also supports the following websites to embed media without a direct
                  link: YouTube, Twitter/X, Reddit, Twitch, TikTok, Instagram, Odysee, Bitchute, Streamable, Spotify and Soundcloud.
                </dd>
                <dt id='uploadimage'>Can I upload an image?</dt>
                <dd>
                  Yes, but only in the Android app, which you can download on <a href='https://github.com/bitsocialhq/5chan/releases/latest'>GitHub</a>. The app is able
                  to automatically upload media to image hosting services, like Imgur or catbox.moe, sharing your IP address with the image hosting service. This is not
                  possible in the browser, which can't make backend requests.
                  <br />
                  <br />
                  If you use the browser version, you should upload images to an image hosting service of your choice, and then past the image link in the [Link] field
                  when submitting content. You can paste any link, not just image links. You can also get an image link from social media, by right clicking the image and
                  selecting "Copy image URL", or by using tools such as <a href='https://cobalt.tools/'>cobalt</a>.<br />
                  <br />
                  The reason why uploading media directly to boards is not possible, is because 5chan is a client for the Bitsocial protocol, which is text-only
                  (including links, from which media is embedded by clients). However, Plebbit uses IPFS, so in theory it could let users upload media to the subplebbit
                  (board) owner's IPFS node, and then post the direct IPFS link for the media. This is not enabled because loading media from IPFS is extremely slow at
                  the moment (because most people have slow internet).
                </dd>
                <dt id='postimage'>Must I post an image?</dt>
                <dd>
                  It depends on the board. Each board has its own rules, and a board owner might decide to only allow posts with images in their community. 5chan
                  automatically filters out text-only threads in the catalog view, to resemble an imageboard, and you can disable this in the [Filters] menu.
                </dd>
                <dt id='replyimage'>Can I reply with an image?</dt>
                <dd>
                  Yes. To reply to a thread with an image of your own, fill in the post box as you normally would, making sure to specify a direct image link (e.g.,
                  ending in .png or .jpeg) in the "Link" field. 5chan will attempt to load the image, and if it worked it will show the Link type as "image", next to the
                  field, before posting. If the Link type is "webpage", the link is not an image, and you should try another link.
                </dd>
                <dt id='quote'>How do I quote somebody?</dt>
                <dd>
                  To quote a portion of text, simply place a pointer ("{'>'}") in front of the text you wish to highlight (ex. "
                  <span className='greentext'>{'>'}This is a quote</span>").
                  <br />
                  <br />
                  Unlike traditional imageboards, 5chan does <i>not</i> allow to quote more than one post at a time. You can only reply to one post at a time. This is
                  because 5chan is a client for the Bitsocial protocol, which is designed to be an alternative to Reddit-like social media, in which you can only reply to
                  one post at a time.
                  <br />
                  <br />
                  Further, post numbers are not possible on 5chan, because Plebbit is fully decentralized (serverless) using IPFS, meaning there is no central database to
                  store post numbers, and it uses CIDs to load posts directly. Retrieving the CID from an hypothetical post number from the single board's database would
                  be far too expensive for the node to calculate.
                  <br />
                  <br />
                </dd>
                <dt id='spoiler'>Can I mark a submission as a spoiler?</dt>
                <dd>
                  All boards allow you to mask plot-spoiling content. To mark your image as a spoiler, check the [x Spoiler?] box before submission. Spoilerizing text
                  makes it unreadable to others until they mouse over it. To spoilerize a comment, place {`<spoiler>`} tags around the text you wish to hide (ex. "
                  {`<spoiler>`}SPIKE DIES!{`</spoiler>`}").
                </dd>
              </dl>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
};

export default FAQ;
