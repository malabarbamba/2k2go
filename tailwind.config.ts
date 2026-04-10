import typography from "@tailwindcss/typography";
import hover3d from "daisyui/components/hover3d/object.js";
import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const hover3dPlugin = plugin(({ addComponents }) => {
	addComponents(hover3d as unknown as Parameters<typeof addComponents>[0]);
});

export default {
	darkMode: "class",
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: "2rem",
			screens: {
				"2xl": "1400px",
			},
		},
		extend: {
			fontFamily: {
				sans: ["Inter", "system-ui", "sans-serif"],
				serif: ["Inter", "system-ui", "sans-serif"],
				display: ["Cinzel", "serif"],
				poppins: ["Poppins", "system-ui", "sans-serif"],
				arabic: ["Noto Naskh Arabic", "Amiri", "serif"],
				sfpro: [
					'"SF Pro Display"',
					'"SF Pro Text"',
					"-apple-system",
					"BlinkMacSystemFont",
					"system-ui",
					'"Segoe UI"',
					"sans-serif",
				],
			},
			colors: {
				brand: {
					DEFAULT: "hsl(var(--brand-green))",
					light: "hsl(var(--brand-green-light))",
					dark: "hsl(var(--brand-green-dark))",
				},
				"brand-green": {
					DEFAULT: "hsl(var(--brand-green))",
					light: "hsl(var(--brand-green-light))",
					dark: "hsl(var(--brand-green-dark))",
				},
				emerald: {
					50: "hsl(var(--brand-green-light))",
					100: "hsl(var(--brand-green-light))",
					200: "hsl(var(--brand-green-light))",
					300: "hsl(var(--brand-green-light))",
					400: "hsl(var(--brand-green))",
					500: "hsl(var(--brand-green))",
					600: "hsl(var(--brand-green-dark))",
					700: "hsl(var(--brand-green-dark))",
					800: "hsl(var(--brand-green-dark))",
					900: "hsl(var(--brand-green-dark))",
					950: "hsl(var(--brand-green-dark))",
				},
				green: {
					50: "hsl(var(--brand-green-light))",
					100: "hsl(var(--brand-green-light))",
					200: "hsl(var(--brand-green-light))",
					300: "hsl(var(--brand-green-light))",
					400: "hsl(var(--brand-green))",
					500: "hsl(var(--brand-green))",
					600: "hsl(var(--brand-green-dark))",
					700: "hsl(var(--brand-green-dark))",
					800: "hsl(var(--brand-green-dark))",
					900: "hsl(var(--brand-green-dark))",
					950: "hsl(var(--brand-green-dark))",
				},
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				background: "hsl(var(--background))",
				foreground: "hsl(var(--foreground))",
				primary: {
					DEFAULT: "hsl(var(--primary))",
					foreground: "hsl(var(--primary-foreground))",
				},
				secondary: {
					DEFAULT: "hsl(var(--secondary))",
					foreground: "hsl(var(--secondary-foreground))",
				},
				destructive: {
					DEFAULT: "hsl(var(--destructive))",
					foreground: "hsl(var(--destructive-foreground))",
				},
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-foreground))",
				},
				accent: {
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-foreground))",
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))",
				},
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				sidebar: {
					DEFAULT: "hsl(var(--sidebar-background))",
					foreground: "hsl(var(--sidebar-foreground))",
					primary: "hsl(var(--sidebar-primary))",
					"primary-foreground": "hsl(var(--sidebar-primary-foreground))",
					accent: "hsl(var(--sidebar-accent))",
					"accent-foreground": "hsl(var(--sidebar-accent-foreground))",
					border: "hsl(var(--sidebar-border))",
					ring: "hsl(var(--sidebar-ring))",
				},
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
			keyframes: {
				"accordion-down": {
					from: {
						height: "0",
					},
					to: {
						height: "var(--radix-accordion-content-height)",
					},
				},
				"accordion-up": {
					from: {
						height: "var(--radix-accordion-content-height)",
					},
					to: {
						height: "0",
					},
				},
				"collapsible-down": {
					from: {
						height: "0",
						opacity: "0",
					},
					to: {
						height: "var(--radix-collapsible-content-height)",
						opacity: "1",
					},
				},
				"collapsible-up": {
					from: {
						height: "var(--radix-collapsible-content-height)",
						opacity: "1",
					},
					to: {
						height: "0",
						opacity: "0",
					},
				},
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
				"collapsible-down":
					"collapsible-down 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
				"collapsible-up": "collapsible-up 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)",
			},
		},
	},
	plugins: [typography, hover3dPlugin],
} satisfies Config;
