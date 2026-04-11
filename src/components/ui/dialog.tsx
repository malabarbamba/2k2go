import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { isAdminMotionScope } from "@/components/ui/motionScope";
import { cn } from "@/lib/utils";

let openDialogContentCount = 0;

const syncDialogOpenRootState = () => {
	if (typeof document === "undefined") {
		return;
	}

	const rootElements = [document.documentElement, document.body];
	for (const element of rootElements) {
		if (!element) {
			continue;
		}

		if (openDialogContentCount > 0) {
			element.setAttribute("data-dialog-open", "true");
		} else {
			element.removeAttribute("data-dialog-open");
		}
	}
};

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn(
			"fixed left-1/2 top-0 z-50 h-[100dvh] w-[100dvw] -translate-x-1/2 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
			className,
		)}
		{...props}
	/>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
		motionPreset?: "default" | "vertical" | "fade";
		closeMode?: "default" | "plain_html";
	}
	>(
		({
			className,
			children,
			motionPreset = "default",
			closeMode = "default",
			...props
		}, ref) => {
	const effectiveMotionPreset =
		motionPreset === "fade" || isAdminMotionScope() ? "fade" : motionPreset;

	React.useEffect(() => {
		openDialogContentCount += 1;
		syncDialogOpenRootState();

		return () => {
			openDialogContentCount = Math.max(0, openDialogContentCount - 1);
			syncDialogOpenRootState();
		};
	}, []);

	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Content
				ref={ref}
				className={cn(
					"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg",
					effectiveMotionPreset === "default"
						? "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
						: effectiveMotionPreset === "vertical"
							? "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-3 data-[state=open]:slide-in-from-bottom-3"
							: "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
					className,
				)}
				{...props}
			>
				{children}
				<DialogPrimitive.Close
					className={cn(
						closeMode === "plain_html"
							? "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-[3px] border border-black bg-[#efefef] text-[13.3333px] font-normal leading-none text-black opacity-100 transition-none hover:opacity-100 focus:outline-none"
							: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none",
					)}
					style={
						closeMode === "plain_html"
							? { fontFamily: "Arial, sans-serif" }
							: undefined
					}
				>
					{closeMode === "plain_html" ? (
						<span aria-hidden="true">x</span>
					) : (
						<X className="h-4 w-4" />
					)}
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
			</DialogPrimitive.Content>
		</DialogPortal>
	);
	},
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col space-y-1.5 text-center sm:text-left",
			className,
		)}
		{...props}
	/>
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
			className,
		)}
		{...props}
	/>
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn(
			"text-lg font-semibold leading-none tracking-tight",
			className,
		)}
		{...props}
	/>
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
	Dialog,
	DialogPortal,
	DialogOverlay,
	DialogClose,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogFooter,
	DialogTitle,
	DialogDescription,
};
