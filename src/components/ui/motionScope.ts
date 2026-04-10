export const isAdminMotionScope = (): boolean => {
	if (typeof document === "undefined") {
		return false;
	}

	return document.body?.dataset.adminScope === "true";
};
