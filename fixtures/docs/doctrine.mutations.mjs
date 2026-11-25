// Planted breaks for fixtures/docs/doctrine.test.mjs: a reference made to teach what the lint fails.
//   node scripts/mutation-run.mjs fixtures/docs/doctrine.mutations.mjs
// Each break adds one example under the reference's title, where nothing says it is wrong.
const TITLE = '# Motion craft\n';
const teach = (name, example) => ({ name, find: TITLE, replace: `${TITLE}\n${example}\n` });

export default {
  target: 'references/motion-craft.md',
  copy: ['README.md', 'GUIDE.md', 'FAQ.md', 'skill-template.md', 'references', 'skill-scaffold', 'scripts', 'design-lock.schema.json', 'package.json', 'fixtures/docs', 'fixtures/motion'],
  test: ['node', '--test', 'fixtures/docs/doctrine.test.mjs'],
  mutations: [
    teach('an inline declaration: transition on everything', 'Give every card `transition: all 200ms ease`.'),
    teach('an inline declaration: a raw colour', 'A success button is `background: #16A34A`.'),
    teach('an inline declaration: a colour keyword', 'A success button is `background: seagreen`.'),
    teach('a fenced block: a raw colour', '```css\n.card { border-color: #16A34A; }\n```'),
    teach('a fenced block: placeholder copy', '```html\n<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>\n```'),
    teach('an inline tag: an image with no alt', 'The hero is `<img src="hero.png">`.'),
    teach('an inline tag: a tab order by number', 'Put the call to action first with `<a href="#buy" tabindex="3">Buy</a>`.'),
    teach('a fenced block of script: a raw colour in a style object', "```jsx\nconst card = <div style={{ color: '#16A34A' }}>Paid</div>;\n```"),
    { name: 'the example it shows as wrong on purpose is gone: the reader could be blind and nobody would know', find: '| `transition: all`, or a blanket transition utility |', replace: '| a transition on every property, or a blanket transition utility |' },
  ],
};
