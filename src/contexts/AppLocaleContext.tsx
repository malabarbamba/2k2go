import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import {
	detectNavigatorLocale,
	readStoredAppLocale,
	writeStoredAppLocale,
	type AppLocale,
} from "@/lib/appLocale";
import { resolveDefaultAppLocale } from "@/services/appLocaleService";

type AppLocaleContextValue = {
	locale: AppLocale;
	setLocale: (locale: AppLocale) => void;
	isResolving: boolean;
};

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

export function AppLocaleProvider({ children }: { children: ReactNode }) {
	const [locale, setLocaleState] = useState<AppLocale>(() => {
		return readStoredAppLocale() ?? detectNavigatorLocale();
	});
	const [isResolving, setIsResolving] = useState(() => readStoredAppLocale() === null);

	useEffect(() => {
		const storedLocale = readStoredAppLocale();
		if (storedLocale) {
			setLocaleState(storedLocale);
			setIsResolving(false);
			return;
		}

		let cancelled = false;
		void (async () => {
			const resolvedLocale = await resolveDefaultAppLocale();
			if (cancelled) {
				return;
			}

			setLocaleState(resolvedLocale);
			setIsResolving(false);
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (typeof document === "undefined") {
			return;
		}

		document.documentElement.lang = locale;
	}, [locale]);

	const value = useMemo<AppLocaleContextValue>(
		() => ({
			locale,
			setLocale: (nextLocale) => {
				writeStoredAppLocale(nextLocale);
				setLocaleState(nextLocale);
				setIsResolving(false);
			},
			isResolving,
		}),
		[isResolving, locale],
	);

	return (
		<AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>
	);
}

export function useAppLocale(): AppLocaleContextValue {
	const context = useContext(AppLocaleContext);
	if (!context) {
		throw new Error("useAppLocale must be used within AppLocaleProvider");
	}

	return context;
}

export function useIsEnglishApp(): boolean {
	return useAppLocale().locale === "en";
}
