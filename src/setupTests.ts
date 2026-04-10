import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
	cleanup();
});

Object.defineProperty(window, "scrollTo", {
	value: () => {},
	writable: true,
});

class ResizeObserverMock {
	observe() {}
	unobserve() {}
	disconnect() {}
}

class IntersectionObserverMock {
	root = null;
	rootMargin = "";
	thresholds = [];

	disconnect() {}
	observe() {}
	takeRecords() {
		return [];
	}
	unobserve() {}
}

Object.defineProperty(window, "ResizeObserver", {
	value: ResizeObserverMock,
	writable: true,
});

Object.defineProperty(window, "IntersectionObserver", {
	value: IntersectionObserverMock,
	writable: true,
});

Object.defineProperty(globalThis, "IntersectionObserver", {
	value: IntersectionObserverMock,
	writable: true,
});

const mockCanvasContext2d = {
	canvas: document.createElement("canvas"),
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	getImageData: (_x: number, _y: number, width: number, height: number) => ({
		data: new Uint8ClampedArray(width * height * 4),
		width,
		height,
	}),
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	createImageData: (width: number, height: number) => ({
		data: new Uint8ClampedArray(width * height * 4),
		width,
		height,
	}),
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	putImageData: (_data: unknown, _dx: number, _dy: number) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	drawImage: (..._args: unknown[]) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	fillRect: (_x: number, _y: number, _w: number, _h: number) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	clearRect: (_x: number, _y: number, _w: number, _h: number) => {},
	beginPath: () => {},
	closePath: () => {},
	stroke: () => {},
	fill: () => {},
	save: () => {},
	restore: () => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	translate: (_x: number, _y: number) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	rotate: (_angle: number) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	scale: (_x: number, _y: number) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	moveTo: (_x: number, _y: number) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	lineTo: (_x: number, _y: number) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	arc: (_x: number, _y: number, _r: number, _s: number, _e: number) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	rect: (_x: number, _y: number, _w: number, _h: number) => {},
	clip: () => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	fillText: (_text: string, _x: number, _y: number) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	strokeText: (_text: string, _x: number, _y: number) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	measureText: (_text: string) => ({ width: 0 }),
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	setTransform: (..._args: unknown[]) => {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	transform: (..._args: unknown[]) => {},
	resetTransform: () => {},
	setLineDash: (_segments: number[]) => {},
	getLineDash: () => [],
	lineDashOffset: 0,
	globalAlpha: 1,
	lineWidth: 1,
	font: "10px sans-serif",
	textAlign: "start",
	textBaseline: "alphabetic",
};

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	value: function getContext(contextId: string, ..._args: unknown[]) {
		if (contextId === "2d") {
			return mockCanvasContext2d;
		}

		return null;
	},
	writable: true,
});

Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
	value: () => "data:image/png;base64,",
	writable: true,
});
