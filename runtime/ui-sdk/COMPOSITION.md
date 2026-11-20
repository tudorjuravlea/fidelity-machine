# UI SDK 0.1.0-beta.10: the markup of each component

Cut from the docs pages shipped in @ui-sdk/web 0.1.0-beta.10 (Apache-2.0, see LICENSE) by scripts/ui-sdk.mjs:
each component's Composition section and the first example of its Usage. In a page with no build
step the `import "@ui-sdk/web/<name>"` line is not needed: `ui-sdk/web.js` defines an element the
first time its tag appears. How to use them with a design system's own markup: references/behavior-kit.md.

## accordion

### Composition

Use the following composition to build a `ui-accordion`:

```text
ui-accordion
├── ui-accordion-item
│   ├── ui-accordion-header
│   │   └── h3
│   │       └── ui-accordion-trigger
│   │           └── button
│   └── ui-accordion-panel
└── ui-accordion-item
    ├── ui-accordion-header
    │   └── h3
    │       └── ui-accordion-trigger
    │           └── button
    └── ui-accordion-panel
```

Give every item a unique `value`. Put its trigger inside a heading, then add the panel it opens. The accordion's value is always an array of open item values, even when only one can be open.

The header wraps your heading and the trigger wraps your button. Use a heading level that fits the surrounding document. Tab moves between triggers; Enter or Space opens and closes their panels. Arrow keys, Home and End do nothing here: the APG removed them from the pattern, and a screen reader’s heading navigation already reaches each trigger.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/accordion"
</script>

<ui-accordion>
  <ui-accordion-item value="shipping">
    <ui-accordion-header>
      <h3>
        <ui-accordion-trigger><button>Shipping</button></ui-accordion-trigger>
      </h3>
    </ui-accordion-header>
    <ui-accordion-panel hidden
      >Orders arrive in five to seven days.</ui-accordion-panel
    >
  </ui-accordion-item>
</ui-accordion>
```

## alert-dialog

### Composition

Use the following composition to build a `ui-alert-dialog`:

```text
ui-alert-dialog
├── ui-alert-dialog-trigger
│   └── button
├── ui-alert-dialog-backdrop
└── ui-alert-dialog-content
    ├── ui-alert-dialog-title
    ├── ui-alert-dialog-description
    ├── ui-alert-dialog-close
    │   └── button
    └── ui-alert-dialog-close
        └── button
```

Put the question in `ui-alert-dialog-title`, explain what happens in `ui-alert-dialog-description`, and wrap each answer's native button in `ui-alert-dialog-close`. Add `ui-alert-dialog-backdrop` to dim the page. Give the content and backdrop `hidden` to keep them hidden before the elements upgrade.

A Close part reports its `value` when it closes. `value="confirm"` is the agreeing answer that the [confirm helper](#confirm) recognizes.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/alert-dialog"
</script>

<ui-alert-dialog>
  <ui-alert-dialog-trigger
    ><button>Delete Project</button></ui-alert-dialog-trigger
  >
  <ui-alert-dialog-content hidden>
    <ui-alert-dialog-title>Delete this project?</ui-alert-dialog-title>
    <ui-alert-dialog-description
      >The project and its files will be deleted for
      everyone.</ui-alert-dialog-description
    >
    <ui-alert-dialog-close><button>Cancel</button></ui-alert-dialog-close>
    <ui-alert-dialog-close value="confirm"
      ><button>Delete</button></ui-alert-dialog-close
    >
  </ui-alert-dialog-content>
</ui-alert-dialog>
```

## autocomplete

### Composition

Use the following composition to build a `ui-autocomplete`:

```text
ui-autocomplete
├── ui-autocomplete-label
├── ui-autocomplete-input
│   └── input
└── ui-autocomplete-content
    ├── ui-autocomplete-empty
    └── ui-autocomplete-list
        ├── ui-autocomplete-item
        └── ui-autocomplete-item
```

Name the input, then put suggestions in a list inside the popup. `ui-autocomplete-input` wraps a native input. Each suggestion needs a unique value.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/autocomplete"
</script>

<ui-autocomplete>
  <ui-autocomplete-label>Fruit</ui-autocomplete-label>
  <ui-autocomplete-input
    ><input placeholder="Type a fruit…"
  /></ui-autocomplete-input>
  <ui-autocomplete-content hidden>
    <ui-autocomplete-list>
      <ui-autocomplete-item value="Apple">Apple</ui-autocomplete-item>
      <ui-autocomplete-item value="Banana">Banana</ui-autocomplete-item>
    </ui-autocomplete-list>
  </ui-autocomplete-content>
</ui-autocomplete>
```

## avatar

### Composition

Use the following composition to build a `ui-avatar`:

```text
ui-avatar
├── img
└── ui-avatar-fallback
```

- `ui-avatar` shares the image's loading state with its parts.
- A direct-child `img` supplies the image. There is no image custom element.
- `ui-avatar-fallback` shows when no image is loaded.

The image is a real `img`, including in server markup. The browser can start fetching it before the elements upgrade. The fallback stays visible until the image loads; if loading fails, the fallback remains.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/avatar"
</script>

<ui-avatar>
  <img src="/ada.png" alt="Ada Lovelace" />
  <ui-avatar-fallback>AL</ui-avatar-fallback>
</ui-avatar>
```

## button

### Usage

Wrap a native `<button>` in `<ui-button>`, then listen for its `action` event to run an action. A button without a type gets `type="button"`.

```html
<ui-button><button>Save</button></ui-button>
```

## calendar

### Composition

Use the following composition to build a `ui-calendar`:

```text
ui-calendar
├── ui-calendar-previous
│   └── button
├── ui-calendar-heading
├── ui-calendar-next
│   └── button
└── ui-calendar-grid
    ├── ui-calendar-weekdays
    │   └── template
    │       └── ui-calendar-weekday
    └── ui-calendar-weeks
        └── template
            └── ui-calendar-day
```

The heading names the displayed month. Previous and Next change it, and a grid holds its weekday headers and dates. Templates inside the weekdays and weeks are copied for each header and date.

An empty `ui-calendar` renders the default structure, and an empty `ui-calendar-grid` renders its headers and weeks. Write the parts out to add your classes and content. Each grid is named by its month and has the `grid` role.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/calendar"
</script>

<ui-calendar default-value="2026-10-16">
  <ui-calendar-previous><button>‹</button></ui-calendar-previous>
  <ui-calendar-heading></ui-calendar-heading>
  <ui-calendar-next><button>›</button></ui-calendar-next>
  <ui-calendar-grid>
    <ui-calendar-weekdays>
      <template><ui-calendar-weekday></ui-calendar-weekday></template>
    </ui-calendar-weekdays>
    <ui-calendar-weeks>
      <template><ui-calendar-day></ui-calendar-day></template>
    </ui-calendar-weeks>
  </ui-calendar-grid>
</ui-calendar>
```

## carousel

### Composition

Use the following composition to build a `ui-carousel`:

```text
ui-carousel
├── ui-carousel-viewport
│   └── ui-carousel-content
│       ├── ui-carousel-item
│       └── ui-carousel-item
├── ui-carousel-previous
│   └── button
└── ui-carousel-next
    └── button
```

Put the slides inside a viewport, then add the controls you need.

The viewport is the scrolling window, and the content is the row of slides inside it, a flex row (a column when vertical). Name the carousel with `aria-label`, like "Featured products". Previous, Next, the indicators and the play toggle wrap your own `<button>`: give it text, or an `aria-label` when it holds an icon.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/carousel"
</script>

<ui-carousel aria-label="Featured">
  <ui-carousel-viewport>
    <ui-carousel-content>
      <ui-carousel-item>First slide</ui-carousel-item>
      <ui-carousel-item>Second slide</ui-carousel-item>
    </ui-carousel-content>
  </ui-carousel-viewport>
  <ui-carousel-previous><button>Previous</button></ui-carousel-previous>
  <ui-carousel-next><button>Next</button></ui-carousel-next>
</ui-carousel>
```

## checkbox

### Composition

Use the following composition to build a `ui-checkbox`:

```text
ui-checkbox
└── ui-checkbox-indicator
```

Wrap the checkbox and its text in a label. The indicator shows while the checkbox is checked or mixed.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/checkbox"
</script>

<label>
  <ui-checkbox>
    <ui-checkbox-indicator aria-hidden="true">✓</ui-checkbox-indicator>
  </ui-checkbox>
  Accept terms and conditions
</label>
```

## collapsible

### Composition

Use the following composition to build a `ui-collapsible`:

```text
ui-collapsible
├── ui-collapsible-trigger
│   └── button
└── ui-collapsible-panel
```

The trigger wraps your own native button, and the root and panel are block elements. Put other content around them, like a heading or a summary that always shows.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/collapsible"
</script>

<ui-collapsible>
  <ui-collapsible-trigger
    ><button>Order details</button></ui-collapsible-trigger
  >
  <ui-collapsible-panel hidden>2 × Linen shirt</ui-collapsible-panel>
</ui-collapsible>
```

## color-picker

### Composition

Use the following composition to build a `ui-color-picker`:

```text
ui-color-picker
├── ui-color-picker-area
│   ├── ui-color-picker-area-canvas
│   └── ui-color-picker-area-thumb
├── ui-color-picker-slider
│   └── ui-color-picker-slider-thumb
├── ui-color-picker-slider
│   └── ui-color-picker-slider-thumb
├── ui-color-picker-swatch
├── ui-color-picker-input
├── ui-color-picker-channel-input
├── ui-color-picker-eye-dropper
└── ui-color-picker-swatches
    ├── ui-color-picker-swatch-item
    └── ui-color-picker-swatch-item
```

Every part is optional, so use the ones your picker needs.

- **ui-color-picker** holds the value and is a group around the parts.
- **ui-color-picker-area** edits two channels, like saturation across and brightness up. A press moves the thumb there and starts a drag. Its background is `--color-area-background`, so give it a size and that background.
- **ui-color-picker-area-canvas** paints the area pixel by pixel, for channels no gradient can draw, like OKLCH's chroma and lightness.
- **ui-color-picker-area-thumb** shows where the color sits in the area. It's a slider that screen readers hear as both channels.
- **ui-color-picker-slider** edits one `channel`, like `hue` or `alpha`, drawn by `--color-slider-background`.
- **ui-color-picker-slider-thumb** shows where the channel sits along its slider.
- **ui-color-picker-swatch** shows the color, named for screen readers, like "vivid blue".
- **ui-color-picker-input** wraps an `<input>`, which reads any CSS color when you press Enter or leave it. Text that isn't a color goes back to the value.
- **ui-color-picker-channel-input** edits one `channel` as a number, in the units people read it in, like 0 to 255 for red.
- **ui-color-picker-eye-dropper** picks a color from anywhere on the screen, where the browser can.
- **ui-color-picker-swatches** and **ui-color-picker-swatch-item** are a list of preset colors.

Each part writes the color as `--color-picker-color`, so a thumb or a swatch fills itself with `background: var(--color-picker-color)`. The picker is form-associated, so it submits its value like a native input. The inputs, the canvas, the eye dropper and preset items use the `<input>`, `<canvas>` or `<button>` you put inside them, or make one.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/color-picker"
</script>

<ui-color-picker aria-label="Brand color" default-value="#0ea5e9">
  <ui-color-picker-area>
    <ui-color-picker-area-thumb></ui-color-picker-area-thumb>
  </ui-color-picker-area>
  <ui-color-picker-slider channel="hue">
    <ui-color-picker-slider-thumb></ui-color-picker-slider-thumb>
  </ui-color-picker-slider>
  <ui-color-picker-input>
    <input aria-label="Hex" />
  </ui-color-picker-input>
</ui-color-picker>
```

## combobox

### Composition

Use the following composition to build a `ui-combobox`:

```text
ui-combobox
├── ui-combobox-label
├── ui-combobox-input
│   └── input
└── ui-combobox-content
    └── ui-combobox-list
        ├── ui-combobox-item
        └── ui-combobox-item
```

Name the input, give each option a unique value, and put the options in a list inside the popup. `ui-combobox-input` wraps a native input. The label names the input; choosing an option puts its label in the input.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/combobox"
</script>

<ui-combobox>
  <ui-combobox-label>Fruit</ui-combobox-label>
  <ui-combobox-input><input placeholder="Search fruits…" /></ui-combobox-input>
  <ui-combobox-content hidden>
    <ui-combobox-list>
      <ui-combobox-item value="apple">Apple</ui-combobox-item>
      <ui-combobox-item value="banana">Banana</ui-combobox-item>
    </ui-combobox-list>
  </ui-combobox-content>
</ui-combobox>
```

## command

### Composition

Use the following composition to build a `ui-command`:

```text
ui-command
├── ui-command-input
│   └── input
├── ui-command-empty
└── ui-command-list
    ├── ui-command-item
    └── ui-command-item
```

Give the input an accessible name and each command a unique value. `ui-command-input` wraps a native input. Keep empty and status messages outside the list, which holds commands and groups. The `action` event reports the value of the command that ran in `event.detail.value`; use it to perform the action.

Use `ui-command-group` and `ui-command-group-label` to name related commands, with a `ui-command-separator` between groups. Groups and separators disappear when filtering leaves them empty.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/command"
</script>

<ui-command>
  <ui-command-input><input aria-label="Search commands" /></ui-command-input>
  <ui-command-empty>No commands found.</ui-command-empty>
  <ui-command-list>
    <ui-command-item value="new-file">New file</ui-command-item>
    <ui-command-item value="new-folder">New folder</ui-command-item>
  </ui-command-list>
</ui-command>
```

## date-input

### Composition

Use the following composition to build a `ui-date-input`:

```text
ui-date-input
├── ui-date-input-segment
│   └── input
└── ui-date-input-segment
```

`<ui-date-input>` renders a group with one `<ui-date-input-segment>` for each part of the date: month, day and year in English, day, month and year in German. Each segment you type in holds an `<input>`. The slashes or dots between them are segments too, as plain text. The input renders its segments for you; give it a `<template>` only to change them, as in [Custom Rendering](#custom-rendering).

### Usage

Put the input in a [Field](./field.md) and give it a label:

```html
<script type="module">
  import "@ui-sdk/web/date-input"
  import "@ui-sdk/web/field"
</script>

<ui-field>
  <ui-field-label>Start date</ui-field-label>
  <ui-date-input default-value="2026-11-02"></ui-date-input>
</ui-field>
```

## date-picker

### Composition

Use the following composition to build a `ui-date-picker`:

```text
ui-date-picker
├── ui-date-picker-input
│   └── input
├── ui-date-picker-trigger
│   └── button
├── ui-date-picker-hint
└── ui-date-picker-content
```

The input accepts a date, the trigger opens the calendar, and the hint describes the expected format. An empty content part renders a calendar for you.

Every [Calendar part](./calendar.md#composition) also works inside `ui-date-picker-content` and is defined by the Date Picker import. Write those parts out when you need to add styles, change the layout, or include custom day content.

An empty `ui-date-picker` renders the input, trigger, and calendar too. In range mode, it renders an input for each end. An input element wraps your native `<input>` or creates one. The trigger, Clear, and presets wrap a `<button>` or create one around their content.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/date-picker"
</script>

<ui-date-picker default-value="2026-10-16">
  <ui-date-picker-input><input aria-label="Due date" /></ui-date-picker-input>
  <ui-date-picker-trigger><button>Choose date</button></ui-date-picker-trigger>
  <ui-date-picker-hint></ui-date-picker-hint>
  <ui-date-picker-content hidden></ui-date-picker-content>
</ui-date-picker>
```

## dialog

### Composition

Use the following composition to build a `ui-dialog`:

```text
ui-dialog
├── ui-dialog-trigger
│   └── button
├── ui-dialog-backdrop
└── ui-dialog-content
    ├── ui-dialog-title
    ├── ui-dialog-description
    └── ui-dialog-close
        └── button
```

The title names the dialog; the description gives it context. A dialog can have several Close parts, each wrapping its own native button. Give an icon-only close button an accessible name, as the first example does. Give the content and backdrop `hidden` to keep them hidden before the elements upgrade.

The backdrop is optional. Without one, style the content’s `::backdrop`. For a question that requires an explicit answer, use [Alert Dialog](./alert-dialog.md).

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/dialog"
</script>

<ui-dialog>
  <ui-dialog-trigger><button>Open</button></ui-dialog-trigger>
  <ui-dialog-backdrop hidden></ui-dialog-backdrop>
  <ui-dialog-content hidden>
    <ui-dialog-title>Project details</ui-dialog-title>
    <ui-dialog-description
      >Review the details before continuing.</ui-dialog-description
    >
    <ui-dialog-close><button>Close</button></ui-dialog-close>
  </ui-dialog-content>
</ui-dialog>
```

## drawer

### Composition

Use the following composition to build a `ui-drawer`:

```text
ui-drawer
├── ui-drawer-trigger
│   └── button
├── ui-drawer-backdrop
└── ui-drawer-content
    ├── ui-drawer-title
    ├── ui-drawer-description
    └── ui-drawer-close
        └── button
```

The content is the sheet. The drawer positions it inside a full-screen viewport and moves it with `translate`. Give it a size, a surface, and corners; leave positioning and translation to the drawer. Give the backdrop a color, such as `bg-black/30`; the drawer manages its opacity. Give the content and backdrop `hidden` to keep them hidden before the elements upgrade.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/drawer"
</script>

<ui-drawer>
  <ui-drawer-trigger><button>Filters</button></ui-drawer-trigger>
  <ui-drawer-backdrop hidden></ui-drawer-backdrop>
  <ui-drawer-content hidden>
    <ui-drawer-title>Filters</ui-drawer-title>
    <ui-drawer-description>Narrow down the results.</ui-drawer-description>
    <ui-drawer-close><button>Done</button></ui-drawer-close>
  </ui-drawer-content>
</ui-drawer>
```

## field

### Composition

Use the following composition to build a `ui-field`:

```text
ui-field
├── ui-field-label
├── ui-input
├── ui-field-description
└── ui-field-error
```

### Usage

```html
<script type="module">
  import "@ui-sdk/web/field"
  import "@ui-sdk/web/input"
</script>

<ui-field name="username">
  <ui-field-label>Username</ui-field-label>
  <ui-input>
    <input autocomplete="username" required />
  </ui-input>
  <ui-field-description>This is your public name.</ui-field-description>
  <ui-field-error></ui-field-error>
</ui-field>
```

## file-input

### Composition

Use the following composition to build a `ui-file-input`:

```text
ui-file-input
├── ui-file-input-trigger
│   └── button
├── ui-file-input-dropzone
└── ui-file-input-list
    └── template
        └── ui-file-input-item
            └── ui-file-input-item-remove
                └── button
```

The trigger wraps a native button that opens the system file picker. The drop zone takes files that are dropped on it or pasted while focus is inside it; keep a trigger beside it for people using a keyboard. The list copies the item in its `<template>` once for each file, and an item's `file` property holds its file; elements in the item with `data-file="name"`, `"size"`, `"type"` or `"path"` show that about the file. A remove button wraps a native button that removes its item's file.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/file-input"
</script>

<ui-file-input name="attachments" multiple>
  <ui-file-input-dropzone>
    <p>Drag and drop files here</p>
    <ui-file-input-trigger><button>Browse Files</button></ui-file-input-trigger>
  </ui-file-input-dropzone>
  <ui-file-input-list aria-label="Files">
    <template>
      <ui-file-input-item>
        <span data-file="name"></span>
        <span data-file="size"></span>
        <ui-file-input-item-remove>
          <button type="button"><svg aria-hidden="true">…</svg></button>
        </ui-file-input-item-remove>
      </ui-file-input-item>
    </template>
  </ui-file-input-list>
</ui-file-input>
```

## hover-card

### Composition

Use the following composition to build a `ui-hover-card`:

```text
ui-hover-card
├── ui-hover-card-trigger
│   └── a
└── ui-hover-card-content
    └── ui-hover-card-arrow
```

The trigger wraps your own link (an `<a>`, so give it an `href`), and pressing it follows the link. The content is the preview, and the arrow is optional.

The card only adds a preview for people who pause on the link: everything in it should be reachable from the page the link goes to, since touch and screen reader users may never open it. For a tip on a button, use a [Tooltip](./tooltip.md). For content that opens with a press, use a [Popover](./popover.md).

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/hover-card"
</script>

<ui-hover-card>
  <ui-hover-card-trigger
    ><a href="/people/hollis">@hollis</a></ui-hover-card-trigger
  >
  <ui-hover-card-content hidden>
    <p>Hollis Grant</p>
    <p>Design engineer on the payments team.</p>
  </ui-hover-card-content>
</ui-hover-card>
```

## image-cropper

### Composition

Use the following composition to build a `ui-image-cropper`:

```text
ui-image-cropper
├── ui-image-cropper-viewport
│   ├── ui-image-cropper-image
│   ├── ui-image-cropper-selection
│   │   └── ui-image-cropper-grid
│   └── ui-image-cropper-handle
├── ui-image-cropper-zoom
├── ui-image-cropper-rotate
└── ui-image-cropper-flip
```

- **ui-image-cropper** holds the crop and the image's `src`, and is a group around the parts.
- **ui-image-cropper-viewport** is the area the image shows in. Give it a size, and its padding keeps the image off its edges.
- **ui-image-cropper-image** wraps your `<img>`, with its `alt`, and turns and flips it.
- **ui-image-cropper-selection** shows the crop over the image. It's a slider you drag or move with the arrow keys.
- **ui-image-cropper-grid** draws lines across the selection, in thirds, for you to style.
- **ui-image-cropper-handle** resizes the selection from one edge or corner, its `position`, like `"se"` for the bottom right. It goes beside the selection, not inside it, and sits on its edge or corner.
- **ui-image-cropper-zoom** wraps a range input from 1, the largest crop, to `max-zoom`.
- **ui-image-cropper-rotate** turns the image a quarter clockwise.
- **ui-image-cropper-flip** mirrors the image left to right, or top to bottom with `direction="vertical"`.

The viewport, image and selection are needed. The rest are optional. The zoom, rotate and flip use the `<input>` or `<button>` you put inside them, or make one.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/image-cropper"
</script>

<ui-image-cropper aria-label="Cover photo" src="cover.jpg" aspect-ratio="3">
  <ui-image-cropper-viewport>
    <ui-image-cropper-image>
      <img alt="Your cover photo" />
    </ui-image-cropper-image>
    <ui-image-cropper-selection></ui-image-cropper-selection>
    <ui-image-cropper-handle position="nw"></ui-image-cropper-handle>
    <ui-image-cropper-handle position="se"></ui-image-cropper-handle>
  </ui-image-cropper-viewport>
</ui-image-cropper>
```

## input

### Composition

Use the following composition to build a `ui-input` or a `ui-input-group`:

```text
ui-input
└── input

ui-input-group
├── ui-input
│   └── input
└── ui-input-clear
    └── button
```

`<ui-input>` wraps your own `<input>`, so put its type, placeholder, autocomplete and other native attributes on the input. `<ui-input-group>` holds text or buttons around it, and `<ui-input-clear>` wraps a button that empties it.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/input"
</script>

<ui-input-group>
  <ui-input><input type="search" aria-label="Search" /></ui-input>
  <ui-input-clear
    ><button type="button" aria-label="Clear search"></button
  ></ui-input-clear>
</ui-input-group>
```

## label

### Usage

Import the label and point its `for` at the control's `id`:

```html
<script type="module">
  import "@ui-sdk/web/label"
  import "@ui-sdk/web/radio"
</script>

<ui-label for="plan">Plan</ui-label>
<ui-radio-group id="plan" default-value="pro">
  <ui-radio value="free">Free</ui-radio>
  <ui-radio value="pro">Pro</ui-radio>
</ui-radio-group>
```

## listbox

### Composition

Use the following composition to build a `ui-listbox`:

```text
ui-listbox
├── ui-listbox-item
│   └── ui-listbox-item-indicator
└── ui-listbox-item
    └── ui-listbox-item-indicator
```

Give the list an accessible name and each option a unique value. `ui-listbox-item-indicator` shows its content when that option is selected.

You can also name the list with a [Field label](./field.md) or `aria-labelledby`. Keep buttons, search fields, and empty messages outside the list: its contents should be options, groups, and separators.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/listbox"
</script>

<ui-listbox aria-label="Toppings" default-value="basil">
  <ui-listbox-item value="basil">
    Basil
    <ui-listbox-item-indicator>✓</ui-listbox-item-indicator>
  </ui-listbox-item>
  <ui-listbox-item value="olive">
    Olive
    <ui-listbox-item-indicator>✓</ui-listbox-item-indicator>
  </ui-listbox-item>
</ui-listbox>
```

## menu

### Composition

Use the following composition to build a `ui-menu`:

```text
ui-menu
├── ui-menu-trigger
│   └── button
└── ui-menu-content
    ├── ui-menu-item
    └── ui-menu-item
```

Give items a `value` and handle the menu’s `action` event to run the selected command. A Group and GroupLabel can organize related actions; a Separator divides them without becoming a focus stop.

Pass a promise to `event.detail.waitUntil()` in the menu’s `action` listener or an item’s `select` listener to keep the item pending. It gets `data-pending`, `aria-busy` and `aria-disabled`, the menu stays open, and choosing it again does nothing until the promise settles. The menu closes once it resolves. A rejection keeps it open and puts the reason in the item’s `error` state until the next try. After a second, screen readers hear the `pending-announcement` attribute, “Loading” by default.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/menu"
</script>

<ui-menu>
  <ui-menu-trigger>
    <button>Actions</button>
  </ui-menu-trigger>
  <ui-menu-content>
    <ui-menu-item value="rename">Rename</ui-menu-item>
    <ui-menu-item value="duplicate">Duplicate</ui-menu-item>
  </ui-menu-content>
</ui-menu>
```

## menubar

### Composition

Use the following composition to build a `ui-menubar`:

```text
ui-menubar
├── ui-menu
│   ├── ui-menu-trigger
│   │   └── button
│   └── ui-menu-content
│       ├── ui-menu-item
│       └── ui-menu-item
└── ui-menu
    ├── ui-menu-trigger
    │   └── button
    └── ui-menu-content
        ├── ui-menu-item
        └── ui-menu-item
```

Each Menu joins its surrounding Menubar automatically. There are no separate menubar trigger or item components. Name the bar with `aria-label` when people need to distinguish it from another one.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/menubar"
  import "@ui-sdk/web/menu"
</script>

<ui-menubar aria-label="Application">
  <ui-menu>
    <ui-menu-trigger>
      <button>File</button>
    </ui-menu-trigger>
    <ui-menu-content>
      <ui-menu-item>New file</ui-menu-item>
      <ui-menu-item>Open file</ui-menu-item>
    </ui-menu-content>
  </ui-menu>
  <ui-menu>
    <ui-menu-trigger>
      <button>Edit</button>
    </ui-menu-trigger>
    <ui-menu-content>
      <ui-menu-item>Undo</ui-menu-item>
      <ui-menu-item>Redo</ui-menu-item>
    </ui-menu-content>
  </ui-menu>
</ui-menubar>
```

## meter

### Composition

Use the following composition to build a `ui-meter`:

```text
ui-meter
├── ui-meter-label
├── ui-meter-value
└── ui-meter-track
    └── ui-meter-indicator
```

- `ui-meter` holds the value and range.
- `ui-meter-label` gives it a visible name. You can use `aria-label` on the root instead.
- `ui-meter-value` displays the formatted value.
- `ui-meter-track` gives the bar its size, and `ui-meter-indicator` fills it.

The value is already part of the root's accessible description. The visible value is hidden from screen readers to avoid reading it twice.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/meter"
</script>

<ui-meter value="40">
  <ui-meter-label></ui-meter-label>
  <ui-meter-value></ui-meter-value>
  <ui-meter-track>
    <ui-meter-indicator></ui-meter-indicator>
  </ui-meter-track>
</ui-meter>
```

## navigation-menu

### Composition

Use the following composition to build a `ui-navigation-menu`:

```text
ui-navigation-menu
├── ui-navigation-menu-list
│   ├── ui-navigation-menu-item
│   │   ├── ui-navigation-menu-trigger
│   │   │   └── button
│   │   └── ui-navigation-menu-content
│   │       └── ui-navigation-menu-link
│   │           └── a
│   └── ui-navigation-menu-item
│       ├── ui-navigation-menu-trigger
│       │   └── button
│       └── ui-navigation-menu-content
│           └── ui-navigation-menu-link
│               └── a
└── ui-navigation-menu-viewport
```

The trigger and the link wrap your own `<button>` and `<a>`, so they stay a real button and a real link. The list and its items take the `list` and `listitem` roles.

Give the navigation an `aria-label`. Each item holds a trigger and its panel, or a plain link. This follows the [disclosure navigation pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/): buttons show groups of ordinary links. Use a [Menu](./menu.md) for actions instead.

The viewport holds the open panel and follows its size and position. Size it with `--viewport-width` and `--viewport-height` and clip its overflow when you use one; [Contents in the Viewport](#contents-in-the-viewport) explains the geometry. You can also [leave the viewport out](#without-a-viewport) and position each panel separately.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/navigation-menu"
</script>

<ui-navigation-menu aria-label="Main">
  <ui-navigation-menu-list>
    <ui-navigation-menu-item value="guides">
      <ui-navigation-menu-trigger
        ><button>Guides</button></ui-navigation-menu-trigger
      >
      <ui-navigation-menu-content>
        <ui-navigation-menu-link
          ><a href="/docs">Introduction</a></ui-navigation-menu-link
        >
      </ui-navigation-menu-content>
    </ui-navigation-menu-item>
  </ui-navigation-menu-list>
  <ui-navigation-menu-viewport></ui-navigation-menu-viewport>
</ui-navigation-menu>
```

## number-input

### Composition

Use the following composition to build a `ui-number-input`:

```text
ui-number-input
├── ui-number-input-scrub-area
│   └── ui-number-input-scrub-area-cursor
└── ui-number-input-group
    ├── ui-number-input-decrement
    │   └── button
    ├── ui-number-input-control
    │   └── input
    └── ui-number-input-increment
        └── button
```

`ui-number-input` holds the numeric value. `ui-number-input-group` wraps the text input and the optional step buttons. `ui-number-input-control` wraps your own `<input>`, and `ui-number-input-decrement` and `ui-number-input-increment` wrap your own `<button>`s, which change the value and repeat while held. Put input styles and accessible names on those native elements. `ui-number-input-scrub-area` is optional and changes the value as you drag it.

Typing updates the value when the text is valid and within bounds. Enter or blur commits it: the text is parsed, clamped, snapped to the step, and formatted. An empty input has the value `null`.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/number-input"
</script>

<ui-number-input default-value="1" min="0">
  <ui-number-input-group>
    <ui-number-input-decrement
      ><button aria-label="Decrease">−</button></ui-number-input-decrement
    >
    <ui-number-input-control
      ><input aria-label="Quantity"
    /></ui-number-input-control>
    <ui-number-input-increment
      ><button aria-label="Increase">+</button></ui-number-input-increment
    >
  </ui-number-input-group>
</ui-number-input>
```

## otp-input

### Composition

Use the following composition to build a `ui-otp-input`:

```text
ui-otp-input
└── ui-otp-input-group
    ├── ui-otp-input-slot
    └── ui-otp-input-slot
```

`ui-otp-input` creates the native input and holds the code. `ui-otp-input-group` lays out a run of slots. Each `ui-otp-input-slot` displays the character at its place among the input's slots, or at its zero-based `index` if you set one. Add `ui-otp-input-separator` between groups when the code is easier to read in sections, like the dash in the example above.

Groups and separators change the presentation of one value. They do not create additional fields or tab stops: the slots display the value of a single native input, which handles selection, paste, undo, form submission, and autofill. It uses `autocomplete="one-time-code"` so supported browsers and password managers can offer a saved or received code.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/otp-input"
</script>

<ui-otp-input max-length="4" aria-label="Verification code">
  <ui-otp-input-group>
    <ui-otp-input-slot></ui-otp-input-slot>
    <ui-otp-input-slot></ui-otp-input-slot>
    <ui-otp-input-slot></ui-otp-input-slot>
    <ui-otp-input-slot></ui-otp-input-slot>
  </ui-otp-input-group>
</ui-otp-input>
```

## pagination

### Composition

Use the following composition to build a `ui-pagination`:

```text
ui-pagination
└── ui-pagination-list
    ├── ui-pagination-item
    │   └── ui-pagination-previous
    │       └── button
    ├── template
    │   └── ui-pagination-item
    │       └── ui-pagination-link
    │           └── button
    ├── template
    │   └── ui-pagination-item
    │       └── ui-pagination-ellipsis
    └── ui-pagination-item
        └── ui-pagination-next
            └── button
```

Name the navigation with `aria-label`, then put the page links and steps in a list.

A list with a `<template>` renders the range from it: one copy for each page, with the page number in an empty button, and the `<template data-ellipsis>` for each gap. Without the ellipsis template, gaps get a plain `<ui-pagination-ellipsis>`. Links and steps wrap your own `<button>`, or an `<a>` with [`getHref`](#links), so style those. Links you write yourself, like a server's, take a `page` attribute.

The template keeps page entries keyed as the range moves. The current page's wrapped button gets `aria-current="page"` and `data-current`; an ellipsis shows “…” and is hidden from screen readers.

Give each step text or an `aria-label` on its wrapped button. At an end, the button gets `aria-disabled="true"` and `data-disabled` and stops changing the page. As a button, it stays in the tab order. Add `disabled` to `<ui-pagination>` to do the same for every page and step, like while results load. A controller still changes the page.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/pagination"
</script>

<ui-pagination aria-label="Pagination" page-count="10">
  <ui-pagination-list>
    <ui-pagination-item>
      <ui-pagination-previous><button>Previous</button></ui-pagination-previous>
    </ui-pagination-item>
    <template>
      <ui-pagination-item>
        <ui-pagination-link><button></button></ui-pagination-link>
      </ui-pagination-item>
    </template>
    <ui-pagination-item>
      <ui-pagination-next><button>Next</button></ui-pagination-next>
    </ui-pagination-item>
  </ui-pagination-list>
</ui-pagination>
```

## password-input

### Composition

Use the following composition to build a `ui-password-input`:

```text
ui-password-input
├── input
└── ui-password-input-toggle
    └── button
```

`ui-password-input` holds the value and visibility state. It connects to your native input and to the button inside `ui-password-input-toggle`. The toggle switches the input between `password` and `text`, and its button is a `type="button"`, so pressing Enter in the input still submits the form.

Put form options such as `name`, `form`, `required`, `disabled`, and `read-only` on `ui-password-input`. Put other native input attributes, such as `autocomplete`, `placeholder` or `id`, on the `<input>`.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/password-input"
</script>

<ui-password-input name="password">
  <input aria-label="Password" />
  <ui-password-input-toggle>
    <button aria-label="Show password">Show</button>
  </ui-password-input-toggle>
</ui-password-input>
```

## popover

### Composition

Use the following composition to build a `ui-popover`:

```text
ui-popover
├── ui-popover-trigger
│   └── button
└── ui-popover-content
    ├── ui-popover-arrow
    ├── ui-popover-title
    ├── ui-popover-description
    └── ui-popover-close
        └── button
```

The content has the dialog role. Its title names it and its description adds context. The arrow is optional, and a popover can have several Close parts. The trigger can live inside the popover or [connect from elsewhere](#triggers-outside-the-popover).

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/popover"
</script>

<ui-popover>
  <ui-popover-trigger>
    <button>Share</button>
  </ui-popover-trigger>
  <ui-popover-content>
    <ui-popover-title>Share this document</ui-popover-title>
    <ui-popover-description
      >Anyone with the link can view it.</ui-popover-description
    >
    <ui-popover-close>
      <button>Done</button>
    </ui-popover-close>
  </ui-popover-content>
</ui-popover>
```

## preferences

### Usage

Define the preference you want to apply. Here, `view` chooses how a file list is laid out:

```ts title="preferences.ts"
import { createPreference } from "@ui-sdk/core"

const view = createPreference({
  values: ["list", "grid"],
  defaultValue: "list",
  attribute: "data-view",
})

export { view }
```

## progress

### Composition

Use the following composition to build a `ui-progress`:

```text
ui-progress
├── ui-progress-label
├── ui-progress-value
└── ui-progress-track
    └── ui-progress-indicator
```

- `ui-progress` holds the value and range.
- `ui-progress-label` gives it a visible name. You can use `aria-label` on the root instead.
- `ui-progress-value` displays the formatted value.
- `ui-progress-track` gives the bar its size, and `ui-progress-indicator` fills it.

The value is already part of the root's accessible description. The visible value is hidden from screen readers to avoid reading it twice.

### Usage

Import the parts and put them together:

```html
<ui-progress value="40">
  <ui-progress-label></ui-progress-label>
  <ui-progress-value></ui-progress-value>
  <ui-progress-track>
    <ui-progress-indicator></ui-progress-indicator>
  </ui-progress-track>
</ui-progress>
```

## radio

### Composition

Use the following composition to build a `ui-radio-group`:

```text
ui-radio-group
├── ui-radio
│   └── ui-radio-indicator
└── ui-radio
    └── ui-radio-indicator
```

Give each radio a `value` and wrap it with its text in a label. The group's value is the checked radio's value, and the indicator shows while its radio is checked.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/field"
  import "@ui-sdk/web/radio"
</script>

<ui-field>
  <ui-field-label>Shipping speed</ui-field-label>
  <ui-radio-group default-value="standard">
    <label>
      <ui-radio value="standard">
        <ui-radio-indicator></ui-radio-indicator>
      </ui-radio>
      Standard
    </label>
    <label>
      <ui-radio value="express">
        <ui-radio-indicator></ui-radio-indicator>
      </ui-radio>
      Express
    </label>
  </ui-radio-group>
</ui-field>
```

## rating

### Composition

Use the following composition to build a `ui-rating`:

```text
ui-rating
└── template
    └── ui-rating-item
```

`ui-rating` renders a `ui-rating-item` per star, copied from the one in its `<template>`, and the radios inside each. Without a template, the items are empty.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/rating"
</script>

<ui-rating aria-label="Rating" default-value="3">
  <template>
    <ui-rating-item>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path
          d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
        />
      </svg>
    </ui-rating-item>
  </template>
</ui-rating>
```

## resizable

### Composition

Use the following composition to build a `ui-resizable`:

```text
ui-resizable
├── ui-resizable-panel
├── ui-resizable-handle
└── ui-resizable-panel
```

Put a handle between the panels you want to resize, and name it with `aria-label`, like "Resize files". The group lays its panels out in a row, so give it a size, and each panel's size is a percentage of the space the panels share. A group can sit inside a panel, like an editor above a terminal.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/resizable"
</script>

<ui-resizable>
  <ui-resizable-panel default-size="30">Files</ui-resizable-panel>
  <ui-resizable-handle aria-label="Resize files"></ui-resizable-handle>
  <ui-resizable-panel>Editor</ui-resizable-panel>
</ui-resizable>
```

## scroll-area

### Composition

Use the following composition to build a `ui-scroll-area`:

```text
ui-scroll-area
├── ui-scroll-area-viewport
│   └── ui-scroll-area-content
└── ui-scroll-area-scrollbar
    └── ui-scroll-area-thumb
```

Put the content inside a viewport, then add a scrollbar for each axis you want to style.

The viewport is the real scroller. Give the root a size, and the viewport the root's full width and height. Scrollbars sit over the viewport's edges. A thumb appears when its axis overflows; [`type`](#when-scrollbars-show) controls when the scrollbar is visible. Render only the scrollbars you want: with none, the browser's own scrollbars stay.

The scroll-to-end part wraps your own `<button>`, so it keeps everything a native button does. The other parts are the elements themselves, and display as blocks.

### Usage

Import the elements and put them together:

```html
<script type="module">
  import "@ui-sdk/web/scroll-area"
</script>

<ui-scroll-area>
  <ui-scroll-area-viewport role="region" aria-label="Release notes">
    <ui-scroll-area-content>Content to scroll</ui-scroll-area-content>
  </ui-scroll-area-viewport>
  <ui-scroll-area-scrollbar orientation="vertical">
    <ui-scroll-area-thumb></ui-scroll-area-thumb>
  </ui-scroll-area-scrollbar>
</ui-scroll-area>
```

## segmented-control

### Composition

Use the following composition to build a `ui-segmented-control`:

```text
ui-segmented-control
├── ui-segmented-control-indicator
├── ui-segmented-control-item
└── ui-segmented-control-item
```

Give each item a `value`. The control's value is the checked item's value, and the indicator sits behind that item.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/segmented-control"
</script>

<ui-segmented-control aria-label="View" default-value="list">
  <ui-segmented-control-indicator></ui-segmented-control-indicator>
  <ui-segmented-control-item value="list">List</ui-segmented-control-item>
  <ui-segmented-control-item value="grid">Grid</ui-segmented-control-item>
</ui-segmented-control>
```

## select

### Composition

Use the following composition to build a `ui-select`:

```text
ui-select
├── ui-select-label
├── ui-select-trigger
│   └── button
│       └── ui-select-value
└── ui-select-content
    ├── ui-select-item
    └── ui-select-item
```

Start with a label, a trigger, and a list of items. `ui-select-value` shows the selected item's label inside the trigger. `ui-select-label` names the trigger; inside a [Field](./field.md), use its `ui-field-label` instead, as the examples do.

### Usage

Import the elements and put them together:

```html
<script type="module">
  import "@ui-sdk/web/select"
</script>

<ui-select placeholder="Select a role">
  <ui-select-label>Role</ui-select-label>
  <ui-select-trigger>
    <button>
      <ui-select-value></ui-select-value>
    </button>
  </ui-select-trigger>
  <ui-select-content>
    <ui-select-item value="viewer">Viewer</ui-select-item>
    <ui-select-item value="editor">Editor</ui-select-item>
  </ui-select-content>
</ui-select>
```

## separator

### Usage

Import the separator and put it between two groups of content:

```html
<script type="module">
  import "@ui-sdk/web/separator"
</script>

<section>
  <h2>Hollis Grant</h2>
  <ui-separator></ui-separator>
  <p>Designs the billing and onboarding flows.</p>
</section>
```

## slider

### Composition

Use the following composition to build a `ui-slider`:

```text
ui-slider
├── ui-slider-value
└── ui-slider-control
    └── ui-slider-track
        ├── ui-slider-indicator
        └── ui-slider-thumb
```

A control handles presses around the track. Put a thumb on that track for each value.

- **ui-slider** holds the value and is a group around the thumbs.
- **ui-slider-control** is where presses land. Pressing it moves the nearest thumb and starts a drag. Give it some height around a thin track.
- **ui-slider-track** is the rail the thumbs move along. Thumbs and the indicator are placed in percentages of it with inline styles, so give it a size. It's the positioned box.
- **ui-slider-indicator** fills the track up to a single thumb, or between the first and last thumb of a range.
- **ui-slider-thumb** is what you drag. Give each one a size.
- **ui-slider-value** shows the formatted value, and a range joined with an en dash. It's optional.

Each thumb renders a visually hidden `<input type="range">` inside itself. That input is what takes focus, so
screen readers on phones adjust it with their own gestures. Style focus on the thumb with `:has(:focus-visible)`.
`<ui-slider>` is form-associated, so it is what the form sees. An empty `<ui-slider-value>` shows the
formatted value.

A single thumb is named by a `ui-field-label` in a `ui-field`, or by `aria-label` on the thumb. In a range, give
each thumb its own `aria-label`, like "Minimum price", and name the group with a `ui-field-label` or
`aria-label` on the slider.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/slider"
</script>

<ui-slider default-value="50">
  <ui-slider-value></ui-slider-value>
  <ui-slider-control>
    <ui-slider-track>
      <ui-slider-indicator></ui-slider-indicator>
      <ui-slider-thumb aria-label="Volume"></ui-slider-thumb>
    </ui-slider-track>
  </ui-slider-control>
</ui-slider>
```

## switch

### Composition

Use the following composition to build a `ui-switch`:

```text
ui-switch
└── ui-switch-thumb
```

Wrap the switch and its text in a label. The thumb stays mounted and gets the switch's state, so CSS can slide it from one end to the other.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/switch"
</script>

<label>
  Airplane mode
  <ui-switch>
    <ui-switch-thumb></ui-switch-thumb>
  </ui-switch>
</label>
```

## tabs

### Composition

Use the following composition to build a `ui-tabs`:

```text
ui-tabs
├── ui-tabs-list
│   ├── ui-tabs-tab
│   │   └── button
│   └── ui-tabs-tab
│       └── button
├── ui-tabs-panel
└── ui-tabs-panel
```

Give each tab and its panel the same unique `value`. Give the list an accessible name. Put a native button inside each `ui-tabs-tab`. Set `default-value` to choose the initial tab; otherwise, the first enabled tab is selected.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/tabs"
</script>

<ui-tabs default-value="account">
  <ui-tabs-list aria-label="Settings">
    <ui-tabs-tab value="account"
      ><button type="button">Account</button></ui-tabs-tab
    >
    <ui-tabs-tab value="password"
      ><button type="button">Password</button></ui-tabs-tab
    >
  </ui-tabs-list>
  <ui-tabs-panel value="account">Manage your profile.</ui-tabs-panel>
  <ui-tabs-panel value="password">Choose a new password.</ui-tabs-panel>
</ui-tabs>
```

## textarea

### Usage

`ui-textarea` wraps your own `<textarea>`. Put `rows`, `placeholder`, `maxlength` and other native attributes on the `<textarea>`.

```html
<script type="module">
  import "@ui-sdk/web/textarea"
</script>

<ui-textarea>
  <textarea
    aria-label="Message"
    placeholder="Type your message here…"
  ></textarea>
</ui-textarea>
```

## time-input

### Composition

Use the following composition to build a `ui-time-input`:

```text
ui-time-input
├── ui-time-input-segment
│   └── input
└── ui-time-input-segment
```

`<ui-time-input>` renders a group with one `<ui-time-input-segment>` for each part of the time, and the text between them.

### Usage

Put the input in a [Field](./field.md) and give it a label:

```html
<script type="module">
  import "@ui-sdk/web/time-input"
  import "@ui-sdk/web/field"
</script>

<ui-field>
  <ui-field-label>Meeting time</ui-field-label>
  <ui-time-input default-value="09:30"></ui-time-input>
</ui-field>
```

## timeline

### Composition

Use the following composition to build a `ui-timeline`:

```text
ui-timeline
├── ui-timeline-item
│   ├── ui-timeline-marker
│   ├── ui-timeline-connector
│   ├── ui-timeline-title
│   ├── ui-timeline-time
│   │   └── time
│   └── ui-timeline-description
└── ui-timeline-item
```

Every part inside an item is optional. `ui-timeline-marker` is the dot or icon on the line, and `ui-timeline-connector` the line to the next event. Both are hidden from screen readers, so they're only for looks.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/timeline"
</script>

<ui-timeline aria-label="Activity">
  <ui-timeline-item>
    <ui-timeline-marker></ui-timeline-marker>
    <ui-timeline-connector></ui-timeline-connector>
    <ui-timeline-title>Deployed to production</ui-timeline-title>
    <ui-timeline-time>
      <time datetime="2026-11-10T14:32">2:32 PM</time>
    </ui-timeline-time>
    <ui-timeline-description>Version 2.4.1 is live.</ui-timeline-description>
  </ui-timeline-item>
</ui-timeline>
```

## toast

### Composition

Use the following composition to build a `ui-toast-region`:

```text
ui-toast-region
└── template
    └── ui-toast
        ├── ui-toast-title
        ├── ui-toast-description
        ├── ui-toast-action
        │   └── button
        └── ui-toast-close
            └── button
```

The region clones the `ui-toast` in its `template` for each toast in its queue, newest first. A toast is named by its title and described by its description. Empty title, description and action parts show the text from the toast's data, so a region's template is usually the same few parts. An empty `ui-toast-close` shows the toast's cancel and runs its `onCancel`, and hides when the toast has none.

### Usage

Import the parts and put them together, then call `toast()` when an action finishes:

```html
<script type="module">
  import "@ui-sdk/web/toast"
  import { toast } from "@ui-sdk/web"

  document
    .querySelector("#create-event")
    .addEventListener("click", () =>
      toast("Event created", { description: "Friday at 10:00 AM" })
    )
</script>

<button id="create-event" type="button">Create Event</button>
<ui-toast-region>
  <template>
    <ui-toast>
      <ui-toast-title></ui-toast-title>
      <ui-toast-description></ui-toast-description>
    </ui-toast>
  </template>
</ui-toast-region>
```

## toggle

### Composition

Use the following composition to build a `ui-toggle`:

```text
ui-toggle
└── button
    └── ui-toggle-icon
```

And a `ui-toggle-group`:

```text
ui-toggle-group
├── ui-toggle
│   └── button
│       └── ui-toggle-icon
└── ui-toggle
    └── button
        └── ui-toggle-icon
```

`ui-toggle` wraps a native button, which reports its state with `aria-pressed`. `ui-toggle-icon` is optional: it holds an icon and hides it from screen readers. In a group, give each toggle a `value`; the group's value lists the pressed ones.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/toggle"
</script>

<ui-toggle>
  <button aria-label="Star">
    <ui-toggle-icon><svg aria-hidden="true">…</svg></ui-toggle-icon>
  </button>
</ui-toggle>
```

## token-input

### Composition

Use the following composition to build a `ui-token-input`:

```text
ui-token-input
├── ui-token-input-editor
└── ui-trigger-menu
```

And for each token, inside a `<template>`:

```text
ui-token-input-token
└── ui-token-input-token-remove
```

`ui-token-input` holds the value, and `ui-token-input-editor` is the text people edit. A [Trigger Menu](./trigger-menu.md) inside it suggests tokens when someone types `@`, `/`, or another trigger. Put a `<template>` inside it, or set its `renderToken` property, to give each token your own markup.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/token-input"
</script>

<ui-token-input value="Explain [@routes.ts](file:src/routes.ts)">
  <ui-token-input-editor aria-label="Prompt"></ui-token-input-editor>
</ui-token-input>
```

## toolbar

### Composition

Use the following composition to build a `ui-toolbar`:

```text
ui-toolbar
├── ui-toolbar-button
│   └── button
├── ui-toolbar-separator
├── ui-toolbar-group
│   ├── ui-toolbar-button
│   │   └── button
│   └── ui-toolbar-button
│       └── button
├── ui-toolbar-link
│   └── a
└── ui-toolbar-input
    └── input
```

Put buttons, links and fields straight inside the toolbar, each in its part: a native `button` in `ui-toolbar-button`, a link in `ui-toolbar-link` and an `input` in `ui-toolbar-input`. `ui-toolbar-group` names a set of related items, and `ui-toolbar-separator` draws a line between sets. Toggles and toggle groups join the toolbar on their own, and menu and select triggers join through `ui-toolbar-button`.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/toolbar"
</script>

<ui-toolbar aria-label="Formatting">
  <ui-toolbar-button><button>Undo</button></ui-toolbar-button>
  <ui-toolbar-button><button>Redo</button></ui-toolbar-button>
  <ui-toolbar-separator></ui-toolbar-separator>
  <ui-toolbar-button><button>Insert Link</button></ui-toolbar-button>
</ui-toolbar>
```

## tooltip

### Composition

Use the following composition to build a `ui-tooltip`:

```text
ui-tooltip
├── ui-tooltip-trigger
│   └── button
└── ui-tooltip-content
    ├── ui-tooltip-arrow
    └── ui-tooltip-shortcut
```

Wrap the trigger and its hint in a tooltip. The trigger wraps your own `<button>` or link, so it keeps everything a native button does. The arrow and the shortcut are optional.

The content has the `tooltip` role, and it's in the page from the start, hidden, so it names or describes its trigger before focus reaches it. It names a trigger without a name of its own, like a button with only an icon, and describes any other: one with text, an `aria-label` or a `title`. `type="label"` or `type="description"` overrides the guess. Keep it to plain text: a tooltip can't be focused, so links or buttons inside it can't be reached. For anything interactive, use a [Popover](./popover.md) or a [Hover Card](./hover-card.md).

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/tooltip"
</script>

<ui-tooltip>
  <ui-tooltip-trigger><button>Share</button></ui-tooltip-trigger>
  <ui-tooltip-content>Anyone with the link can view</ui-tooltip-content>
</ui-tooltip>
```

## tree

### Composition

Use the following composition to build a `ui-tree`:

```text
ui-tree
├── ui-tree-item
│   ├── ui-tree-item-label
│   │   └── ui-tree-item-indicator
│   └── ui-tree-group
│       └── ui-tree-item
│           └── ui-tree-item-label
└── ui-tree-item
    └── ui-tree-item-label
```

Give the tree an accessible name and every item a unique `value`. An item with a `ui-tree-group` inside it is a branch. The group holds its children; the label names the item. The indicator and checkbox are optional, and they belong to the item around them, so put them inside its label to make them part of the row.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/tree"
</script>

<ui-tree aria-label="Project files">
  <ui-tree-item value="src">
    <ui-tree-item-label>
      <ui-tree-item-indicator>›</ui-tree-item-indicator>
      src
    </ui-tree-item-label>
    <ui-tree-group>
      <ui-tree-item value="src/index.ts">
        <ui-tree-item-label>index.ts</ui-tree-item-label>
      </ui-tree-item>
    </ui-tree-group>
  </ui-tree-item>
  <ui-tree-item value="package.json">
    <ui-tree-item-label>package.json</ui-tree-item-label>
  </ui-tree-item>
</ui-tree>
```

## trigger-menu

### Composition

Use the following composition to build a `ui-trigger-menu`:

```text
ui-trigger-menu
├── ui-trigger-menu-input
│   └── textarea
├── ui-trigger-menu-status
└── ui-trigger-menu-content
    ├── ui-trigger-menu-empty
    └── ui-trigger-menu-list
        ├── ui-trigger-menu-item
        └── ui-trigger-menu-item
```

`ui-trigger-menu` holds the triggers and what each one lists, set as its `triggers` property. `ui-trigger-menu-input` wraps the `<textarea>` or `<input>` people type in, and `ui-trigger-menu-content` is the popup with the suggestions. Without a `ui-trigger-menu-content` among its direct children, the menu renders the current trigger's items for you, and so does a list without items of its own. Inside a [Token Input](./token-input.md), leave out `ui-trigger-menu-input`: the menu suggests into the token input.

### Usage

Import the parts and put them together:

```html
<script type="module">
  import "@ui-sdk/web/trigger-menu"

  document.querySelector("ui-trigger-menu").triggers = [{ char: "@" }]
</script>

<ui-trigger-menu>
  <ui-trigger-menu-input>
    <textarea
      aria-label="Message"
      placeholder="Type @ to mention someone…"
    ></textarea>
  </ui-trigger-menu-input>
  <ui-trigger-menu-content>
    <ui-trigger-menu-list>
      <ui-trigger-menu-item value="hollis" label="Hollis Grant"
        >Hollis Grant</ui-trigger-menu-item
      >
      <ui-trigger-menu-item value="ines" label="Inès Moreau"
        >Inès Moreau</ui-trigger-menu-item
      >
    </ui-trigger-menu-list>
  </ui-trigger-menu-content>
</ui-trigger-menu>
```

## waterfall

### Composition

Use the following composition to build a `ui-waterfall`:

```text
ui-waterfall
├── ui-waterfall-header-row
│   ├── ui-waterfall-column-header
│   └── ui-waterfall-column-header
│       ├── ui-waterfall-axis
│       │   └── ui-waterfall-tick
│       └── ui-waterfall-mark
├── ui-waterfall-row
│   ├── ui-waterfall-row-header
│   │   └── ui-waterfall-indicator
│   ├── ui-waterfall-cell
│   └── ui-waterfall-bar
└── ui-waterfall-row
    ├── ui-waterfall-row-header
    └── ui-waterfall-bar
```

Pass every span as `items` and write a `ui-waterfall-row` for each with the span's `value`. The rows are flat siblings: the waterfall reads each one's level, place among its siblings and children from `items`. Give the waterfall an accessible name.

`ui-waterfall-row-header` names the span, and holds the `ui-waterfall-indicator` of a span with children. `ui-waterfall-bar` is the cell on the time axis. `ui-waterfall-cell` is any other column, like a status or a size. The header row, the axis and marks are optional.

### Usage

Each span has a `value`, a `label`, a `start` and a `duration` in milliseconds, and the spans it started as `children`. Set them as the `items` property:

```html
<ui-waterfall aria-label="Network requests">
  <ui-waterfall-row value="document">
    <ui-waterfall-row-header>/</ui-waterfall-row-header>
    <ui-waterfall-bar></ui-waterfall-bar>
  </ui-waterfall-row>
  <ui-waterfall-row value="script">
    <ui-waterfall-row-header>app.js</ui-waterfall-row-header>
    <ui-waterfall-bar></ui-waterfall-bar>
  </ui-waterfall-row>
</ui-waterfall>

<script type="module">
  import "@ui-sdk/web/waterfall"

  document.querySelector("ui-waterfall").items = [
    { value: "document", label: "/", start: 0, duration: 182 },
    { value: "script", label: "app.js", start: 192, duration: 410 },
  ]
</script>
```
