# YouTube Shortcuts (TikTok Style)

A Chrome extension that brings TikTok-style keyboard shortcuts to YouTube, making video navigation more intuitive and efficient.

## Overview

This extension is inspired by TikTok's keyboard shortcuts, allowing you to control YouTube videos with familiar key combinations. Navigate, scroll, and interact with YouTube videos just like you would on TikTok.

## Features

- **Customizable Key Bindings**: Set your own shortcuts for each action
- **Scroll Up/Down**: Use W/S keys (or arrow keys) to scroll the page smoothly
- **Rewind/Forward**: Use A/D keys to skip backward/forward by 5 seconds
- **Hold to Speed Up**: Long-press D key (or right arrow) to fast-forward videos
- **Like/Unlike**: Press Z key to quickly like or unlike videos
- **Arrow Key Support**: Optional arrow key controls matching WASD functionality
- **Adjustable Scroll Speed**: Customize scrolling speed from 1-50
- **Dark Mode Support**: Fully supports system dark mode

## Installation

1. Open Chrome browser and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select this extension's folder
5. Done!

## Usage

### Default Shortcuts

- **W key** = Scroll up
- **A key** = Rewind 5 seconds
- **S key** = Scroll down
- **D key** = Forward 5 seconds
- **Hold D key** = Fast forward (spacebar)
- **Z key** = Like/Unlike video

### Settings

Click the extension icon to open the settings popup where you can:
- Customize key bindings for each action
- Unbind keys you don't want to use
- Adjust scroll speed (1-50, default: 20)
- Enable/disable arrow key controls
- Reset to default settings

### Options

- **Hold right arrow to speed up**: Enable long-press right arrow key for fast-forward (default: ON)
- **Use arrow keys to scroll**: Enable up/down arrow keys for scrolling (default: ON)

## How It Works

This extension mimics TikTok's intuitive keyboard shortcuts on YouTube:
- **TikTok-style navigation**: Similar key bindings to TikTok for familiar experience
- **Smooth scrolling**: Continuous scrolling when holding scroll keys
- **Smart input detection**: Automatically ignores keyboard input when typing in text fields
- **Real-time settings**: Changes require page refresh to apply (refresh button provided)

## Technical Details

- Built with Manifest V3
- Content script runs on YouTube pages
- Settings stored in Chrome sync storage
- Fully supports dark mode
- No external dependencies

## Notes

- The extension only works on YouTube pages
- Keyboard shortcuts are disabled when focus is in input fields or text areas
- Settings changes require a page refresh to take effect
- The extension does not interfere with YouTube's native keyboard shortcuts when not bound

## License

This project is open source and available for modification and distribution.
