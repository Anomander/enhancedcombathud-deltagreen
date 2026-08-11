# Delta Green Enhanced Combat HUD

An Enhanced Combat HUD interface designed specifically for the **Delta Green** game system in **Foundry VTT**. Inspired by Argon / Enhanced Combat HUD, this module provides an intuitive, tactical bottom dock for Agents and Handlers during combat operations.

![Delta Green Combat HUD Banner](https://raw.githubusercontent.com/Anomander/delta-green-combat-hud/main/docs/assets/banner.png)

## Features

- 🛡️ **Agent Vitals & Dossier**: Direct real-time tracking of Hit Points (HP), Willpower Points (WP), Sanity (SAN), Breaking Point, and Armor rating.
- 🔫 **Weapon Set Slots**: Rapid item equipping & weapon switching (Primary, Secondary, Melee/Unarmed, Tactical/Explosives).
- 🎲 **Tactical Roll Engine**: Integrated percentile checks for Firearms, Heavy Weapons, Melee, Lethality percentage rolls, Damage rolls, and Skill checks.
- 🧠 **Sanity & Willpower Actions**: Quick SAN Loss rolls, Adapting to Helplessness/Violence checks, and Willpower expenditure (+20% bonus boost / panic suppression).
- 🎯 **Tactical Targeting Overlay**: Select targets on canvas directly from the HUD (`Shift+A` keybind, token control toggle, `T`/`+`/`-` hotkeys).
- ⚡ **Combat Turn Tracker**: Integrates with Foundry Combat Tracker to manage movement allowance, action status, and turn passing.
- 🎨 **Handler/Agent Aesthetic**: Dark, classified tactical interface with sleek green neon highlights and glassmorphism.

## Installation

### Manifest URL
To install the module in Foundry VTT:
1. Open the **Foundry VTT Setup Screen** -> **Add-on Modules**.
2. Click **Install Module**.
3. Paste the following manifest link into the **Manifest URL** field:
   ```
   https://github.com/Anomander/delta-green-combat-hud/releases/latest/download/module.json
   ```
4. Click **Install**.

## Usage

- **Toggle HUD**: Press `Shift+A` or click the crossed swords icon in the Token Control toolbar.
- **Equip Weapons**: Drag items directly into weapon slots or select from the weapon tray.
- **Target Selection**: Click an attack action to activate target mode, then left-click target tokens.

## Developer & Contributing

See [CLAUDE.md](CLAUDE.md) for build, testing, and release guidelines.

```bash
npm install     # Install dependencies
npm test        # Run Vitest test suite
npm run build   # Build distribution bundle in dist/
```

## License

[MIT License](LICENSE)
