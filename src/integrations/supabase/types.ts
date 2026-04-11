export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: "14.1";
	};
	public: {
		Tables: {
			admin_2fa_codes: {
				Row: {
					code: string;
					created_at: string | null;
					expires_at: string;
					id: string;
					used: boolean | null;
					user_id: string;
				};
				Insert: {
					code: string;
					created_at?: string | null;
					expires_at: string;
					id?: string;
					used?: boolean | null;
					user_id: string;
				};
				Update: {
					code?: string;
					created_at?: string | null;
					expires_at?: string;
					id?: string;
					used?: boolean | null;
					user_id?: string;
				};
				Relationships: [];
			};
			app_v2_session_unique_visitors: {
				Row: {
					first_seen_at: string;
					first_seen_user_id: string | null;
					source_path: string;
					visitor_id: string;
				};
				Insert: {
					first_seen_at?: string;
					first_seen_user_id?: string | null;
					source_path?: string;
					visitor_id: string;
				};
				Update: {
					first_seen_at?: string;
					first_seen_user_id?: string | null;
					source_path?: string;
					visitor_id?: string;
				};
				Relationships: [];
			};
			click_events: {
				Row: {
					created_at: string;
					element_selector: string | null;
					element_text: string | null;
					id: string;
					page_path: string;
					session_id: string;
					viewport_height: number | null;
					viewport_width: number | null;
					x_position: number | null;
					y_position: number | null;
				};
				Insert: {
					created_at?: string;
					element_selector?: string | null;
					element_text?: string | null;
					id?: string;
					page_path: string;
					session_id: string;
					viewport_height?: number | null;
					viewport_width?: number | null;
					x_position?: number | null;
					y_position?: number | null;
				};
				Update: {
					created_at?: string;
					element_selector?: string | null;
					element_text?: string | null;
					id?: string;
					page_path?: string;
					session_id?: string;
					viewport_height?: number | null;
					viewport_width?: number | null;
					x_position?: number | null;
					y_position?: number | null;
				};
				Relationships: [];
			};
			deck_download_rate_limits: {
				Row: {
					count: number;
					k_hash: string;
					window_start: string;
				};
				Insert: {
					count?: number;
					k_hash: string;
					window_start?: string;
				};
				Update: {
					count?: number;
					k_hash?: string;
					window_start?: string;
				};
				Relationships: [];
			};
			deck_downloads: {
				Row: {
					birthdate: string;
					created_at: string;
					deck_name: string;
					email: string;
					ip: string | null;
					name: string;
					position: number;
					sex: string;
					source_page: string | null;
					status_email_admin: string | null;
					status_email_user: string | null;
					trigger_id: string;
					user_agent: string | null;
				};
				Insert: {
					birthdate: string;
					created_at?: string;
					deck_name: string;
					email: string;
					ip?: string | null;
					name: string;
					position?: number;
					sex: string;
					source_page?: string | null;
					status_email_admin?: string | null;
					status_email_user?: string | null;
					trigger_id?: string;
					user_agent?: string | null;
				};
				Update: {
					birthdate?: string;
					created_at?: string;
					deck_name?: string;
					email?: string;
					ip?: string | null;
					name?: string;
					position?: number;
					sex?: string;
					source_page?: string | null;
					status_email_admin?: string | null;
					status_email_user?: string | null;
					trigger_id?: string;
					user_agent?: string | null;
				};
				Relationships: [];
			};
			friend_requests: {
				Row: {
					created_at: string;
					id: string;
					recipient_user_id: string;
					requester_user_id: string;
					responded_at: string | null;
					status: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					recipient_user_id: string;
					requester_user_id: string;
					responded_at?: string | null;
					status?: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					recipient_user_id?: string;
					requester_user_id?: string;
					responded_at?: string | null;
					status?: string;
				};
				Relationships: [];
			};
			friendships: {
				Row: {
					created_at: string;
					id: string;
					user_a_id: string;
					user_b_id: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					user_a_id: string;
					user_b_id: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					user_a_id?: string;
					user_b_id?: string;
				};
				Relationships: [];
			};
			home_hero_cta_variants: {
				Row: {
					created_at: string;
					id: string;
					is_active: boolean;
					label: string;
					updated_at: string;
					variant_index: number;
				};
				Insert: {
					created_at?: string;
					id: string;
					is_active?: boolean;
					label: string;
					updated_at?: string;
					variant_index: number;
				};
				Update: {
					created_at?: string;
					id?: string;
					is_active?: boolean;
					label?: string;
					updated_at?: string;
					variant_index?: number;
				};
				Relationships: [];
			};
			page_views: {
				Row: {
					browser: string | null;
					city: string | null;
					country: string | null;
					created_at: string;
					device_type: string | null;
					id: string;
					page_path: string;
					page_title: string | null;
					referrer: string | null;
					session_id: string;
				};
				Insert: {
					browser?: string | null;
					city?: string | null;
					country?: string | null;
					created_at?: string;
					device_type?: string | null;
					id?: string;
					page_path: string;
					page_title?: string | null;
					referrer?: string | null;
					session_id: string;
				};
				Update: {
					browser?: string | null;
					city?: string | null;
					country?: string | null;
					created_at?: string;
					device_type?: string | null;
					id?: string;
					page_path?: string;
					page_title?: string | null;
					referrer?: string | null;
					session_id?: string;
				};
				Relationships: [];
			};
			pro_capacity: {
				Row: {
					id: number;
					pro_active_count: number;
					pro_limit: number;
					updated_at: string;
				};
				Insert: {
					id?: number;
					pro_active_count?: number;
					pro_limit?: number;
					updated_at?: string;
				};
				Update: {
					id?: number;
					pro_active_count?: number;
					pro_limit?: number;
					updated_at?: string;
				};
				Relationships: [];
			};
			pro_requests: {
				Row: {
					created_at: string;
					id: string;
					payload_json: Json | null;
					status: string;
					type: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					payload_json?: Json | null;
					status?: string;
					type: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					payload_json?: Json | null;
					status?: string;
					type?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			pro_waitlist: {
				Row: {
					created_at: string;
					email: string;
					id: string;
					user_id: string | null;
				};
				Insert: {
					created_at?: string;
					email: string;
					id?: string;
					user_id?: string | null;
				};
				Update: {
					created_at?: string;
					email?: string;
					id?: string;
					user_id?: string | null;
				};
				Relationships: [];
			};
			profiles: {
				Row: {
					admin_override_expires_at: string | null;
					admin_override_pro: boolean | null;
					analytics_consent: boolean | null;
					analytics_consent_at: string | null;
					analytics_consent_source: string | null;
					avatar_url: string | null;
					bio: string | null;
					birthdate: string | null;
					daily_flow_tutorial_seen_at: string | null;
					created_at: string;
					deck_perso_tutorial_seen_at: string | null;
					email: string | null;
					followers_count: number;
					following_count: number;
					first_name: string | null;
					fsrs_target_retention: number;
					id: string;
					is_public: boolean;
					last_name: string | null;
					learning_level: string | null;
					location: string | null;
					motto: string | null;
					new_cards_per_day: number;
					scheduler_day_cutoff_hour: number;
					scheduler_timezone: string;
					notifications_email: boolean | null;
					onboarding_assessment: Json | null;
					plan: string | null;
					preferred_categories: string[] | null;
					pro_end_at: string | null;
					progression_tutorial_seen_at: string | null;
					pro_start_at: string | null;
					pro_status: string | null;
					sex: string | null;
					stripe_customer_id: string | null;
					stripe_subscription_id: string | null;
					updated_at: string;
					user_id: string;
					username: string | null;
				};
				Insert: {
					admin_override_expires_at?: string | null;
					admin_override_pro?: boolean | null;
					analytics_consent?: boolean | null;
					analytics_consent_at?: string | null;
					analytics_consent_source?: string | null;
					avatar_url?: string | null;
					bio?: string | null;
					birthdate?: string | null;
					daily_flow_tutorial_seen_at?: string | null;
					created_at?: string;
					deck_perso_tutorial_seen_at?: string | null;
					email?: string | null;
					followers_count?: number;
					following_count?: number;
					first_name?: string | null;
					fsrs_target_retention?: number;
					id?: string;
					is_public?: boolean;
					last_name?: string | null;
					learning_level?: string | null;
					location?: string | null;
					motto?: string | null;
					new_cards_per_day?: number;
					scheduler_day_cutoff_hour?: number;
					scheduler_timezone?: string;
					notifications_email?: boolean | null;
					onboarding_assessment?: Json | null;
					plan?: string | null;
					preferred_categories?: string[] | null;
					pro_end_at?: string | null;
					progression_tutorial_seen_at?: string | null;
					pro_start_at?: string | null;
					pro_status?: string | null;
					sex?: string | null;
					stripe_customer_id?: string | null;
					stripe_subscription_id?: string | null;
					updated_at?: string;
					user_id: string;
					username?: string | null;
				};
				Update: {
					admin_override_expires_at?: string | null;
					admin_override_pro?: boolean | null;
					analytics_consent?: boolean | null;
					analytics_consent_at?: string | null;
					analytics_consent_source?: string | null;
					avatar_url?: string | null;
					bio?: string | null;
					birthdate?: string | null;
					daily_flow_tutorial_seen_at?: string | null;
					created_at?: string;
					deck_perso_tutorial_seen_at?: string | null;
					email?: string | null;
					followers_count?: number;
					following_count?: number;
					first_name?: string | null;
					fsrs_target_retention?: number;
					id?: string;
					is_public?: boolean;
					last_name?: string | null;
					learning_level?: string | null;
					location?: string | null;
					motto?: string | null;
					new_cards_per_day?: number;
					scheduler_day_cutoff_hour?: number;
					scheduler_timezone?: string;
					notifications_email?: boolean | null;
					onboarding_assessment?: Json | null;
					plan?: string | null;
					preferred_categories?: string[] | null;
					pro_end_at?: string | null;
					progression_tutorial_seen_at?: string | null;
					pro_start_at?: string | null;
					pro_status?: string | null;
					sex?: string | null;
					stripe_customer_id?: string | null;
					stripe_subscription_id?: string | null;
					updated_at?: string;
					user_id?: string;
					username?: string | null;
				};
				Relationships: [];
			};
			preview_session_audio_posts: {
				Row: {
					audio_storage_path: string;
					created_at: string;
					foundation_card_id: string | null;
					id: string;
					recording_duration_ms: number | null;
					share_dispatched_at: string | null;
					share_marked_at: string | null;
					share_selected: boolean;
					share_session_key: string | null;
					updated_at: string;
					user_id: string;
					vocabulary_card_id: string | null;
				};
				Insert: {
					audio_storage_path: string;
					created_at?: string;
					foundation_card_id?: string | null;
					id?: string;
					recording_duration_ms?: number | null;
					share_dispatched_at?: string | null;
					share_marked_at?: string | null;
					share_selected?: boolean;
					share_session_key?: string | null;
					updated_at?: string;
					user_id: string;
					vocabulary_card_id?: string | null;
				};
				Update: {
					audio_storage_path?: string;
					created_at?: string;
					foundation_card_id?: string | null;
					id?: string;
					recording_duration_ms?: number | null;
					share_dispatched_at?: string | null;
					share_marked_at?: string | null;
					share_selected?: boolean;
					share_session_key?: string | null;
					updated_at?: string;
					user_id?: string;
					vocabulary_card_id?: string | null;
				};
				Relationships: [];
			};
			preview_session_audio_replies: {
				Row: {
					audio_post_id: string;
					audio_duration_ms: number | null;
					audio_storage_path: string | null;
					body_text: string | null;
					created_at: string;
					id: string;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					audio_post_id: string;
					audio_duration_ms?: number | null;
					audio_storage_path?: string | null;
					body_text?: string | null;
					created_at?: string;
					id?: string;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					audio_post_id?: string;
					audio_duration_ms?: number | null;
					audio_storage_path?: string | null;
					body_text?: string | null;
					created_at?: string;
					id?: string;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			preview_session_audio_share_dispatches: {
				Row: {
					dispatched_at: string;
					id: string;
					notified_friend_count: number;
					session_key: string;
					shared_audio_count: number;
					user_id: string;
				};
				Insert: {
					dispatched_at?: string;
					id?: string;
					notified_friend_count?: number;
					session_key: string;
					shared_audio_count?: number;
					user_id: string;
				};
				Update: {
					dispatched_at?: string;
					id?: string;
					notified_friend_count?: number;
					session_key?: string;
					shared_audio_count?: number;
					user_id?: string;
				};
				Relationships: [];
			};
			preview_session_text_messages: {
				Row: {
					created_at: string;
					foundation_card_id: string | null;
					id: string;
					message_text: string;
					updated_at: string;
					user_id: string;
					vocabulary_card_id: string | null;
				};
				Insert: {
					created_at?: string;
					foundation_card_id?: string | null;
					id?: string;
					message_text: string;
					updated_at?: string;
					user_id: string;
					vocabulary_card_id?: string | null;
				};
				Update: {
					created_at?: string;
					foundation_card_id?: string | null;
					id?: string;
					message_text?: string;
					updated_at?: string;
					user_id?: string;
					vocabulary_card_id?: string | null;
				};
				Relationships: [];
			};
			suggestions: {
				Row: {
					created_at: string;
					id: string;
					message: string;
					screenshot_url: string | null;
					status: string;
					status_updated_at: string;
					theme: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					message: string;
					screenshot_url?: string | null;
					status?: string;
					status_updated_at?: string;
					theme: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					message?: string;
					screenshot_url?: string | null;
					status?: string;
					status_updated_at?: string;
					theme?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			user_notifications: {
				Row: {
					archived_at: string | null;
					body: string;
					category: string;
					created_at: string;
					dismissed_at: string | null;
					id: string;
					notification_type: string;
					payload_json: Json;
					read_at: string | null;
					title: string;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					archived_at?: string | null;
					body: string;
					category?: string;
					created_at?: string;
					dismissed_at?: string | null;
					id?: string;
					notification_type?: string;
					payload_json?: Json;
					read_at?: string | null;
					title: string;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					archived_at?: string | null;
					body?: string;
					category?: string;
					created_at?: string;
					dismissed_at?: string | null;
					id?: string;
					notification_type?: string;
					payload_json?: Json;
					read_at?: string | null;
					title?: string;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			user_personal_immersion_videos: {
				Row: {
					author: string | null;
					created_at: string;
					description: string;
					id: string;
					import_status: string;
					original_description: string | null;
					original_title: string | null;
					source_url: string;
					thumbnail_url: string | null;
					title: string;
					updated_at: string;
					user_id: string;
					video_id: string | null;
					youtube_id: string;
				};
				Insert: {
					author?: string | null;
					created_at?: string;
					description?: string;
					id?: string;
					import_status?: string;
					original_description?: string | null;
					original_title?: string | null;
					source_url: string;
					thumbnail_url?: string | null;
					title: string;
					updated_at?: string;
					user_id: string;
					video_id?: string | null;
					youtube_id: string;
				};
				Update: {
					author?: string | null;
					created_at?: string;
					description?: string;
					id?: string;
					import_status?: string;
					original_description?: string | null;
					original_title?: string | null;
					source_url?: string;
					thumbnail_url?: string | null;
					title?: string;
					updated_at?: string;
					user_id?: string;
					video_id?: string | null;
					youtube_id?: string;
				};
				Relationships: [];
			};
			user_dashboard_progress: {
				Row: {
					created_at: string;
					phase1_grammar_choice: string | null;
					phase1_grammar_started_at: string | null;
					phase_action_progress: Json;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					phase1_grammar_choice?: string | null;
					phase1_grammar_started_at?: string | null;
					phase_action_progress?: Json;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					phase1_grammar_choice?: string | null;
					phase1_grammar_started_at?: string | null;
					phase_action_progress?: Json;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			user_roles: {
				Row: {
					created_at: string;
					id: string;
					role: Database["public"]["Enums"]["app_role"];
					user_id: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					role: Database["public"]["Enums"]["app_role"];
					user_id: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					role?: Database["public"]["Enums"]["app_role"];
					user_id?: string;
				};
				Relationships: [];
			};
			visitor_sessions: {
				Row: {
					browser: string | null;
					city: string | null;
					country: string | null;
					device_type: string | null;
					id: string;
					ip_hash: string | null;
					last_activity_at: string;
					started_at: string;
					user_agent: string | null;
					user_id: string | null;
					visitor_id: string;
				};
				Insert: {
					browser?: string | null;
					city?: string | null;
					country?: string | null;
					device_type?: string | null;
					id?: string;
					ip_hash?: string | null;
					last_activity_at?: string;
					started_at?: string;
					user_agent?: string | null;
					user_id?: string | null;
					visitor_id: string;
				};
				Update: {
					browser?: string | null;
					city?: string | null;
					country?: string | null;
					device_type?: string | null;
					id?: string;
					ip_hash?: string | null;
					last_activity_at?: string;
					started_at?: string;
					user_agent?: string | null;
					user_id?: string | null;
					visitor_id?: string;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			get_app_v2_session_unique_visitors_total: {
				Args: never;
				Returns: number;
			};
			get_total_accounts_count_v1: {
				Args: never;
				Returns: number;
			};
			dispatch_preview_session_audio_share_batch: {
				Args: { p_session_key: string };
				Returns: {
					already_dispatched: boolean;
					notified_friend_count: number;
					shared_audio_count: number;
				}[];
			};
			get_profile_connection_context_v1: {
				Args: { p_limit?: number; p_target_user_id: string };
				Returns: {
					connection_count: number;
					connections: Json;
					incoming_request_count: number;
					incoming_requests: Json;
					relationship_state: string;
				}[];
			};
			get_profile_progression_summary_v1: {
				Args: { p_target_user_id: string };
				Returns: {
					connection_streak_record_days: number;
					longest_streak_days: number;
					mastered_words: number;
					mastery_progress: number;
					monthly_review_days_current: number;
					monthly_review_days_progress: number;
					monthly_review_days_target: number;
					review_current: number;
					review_progress: number;
					review_streak_days: number;
					review_target: number;
					total_immersion_minutes: number;
					unlocked_distinction_ids: string[];
					words_acquired_count: number;
				}[];
			};
			get_profile_social_summary_v1: {
				Args: { p_target_user_id: string };
				Returns: {
					audio_recorded_count: number;
					last_activity_at: string | null;
				}[];
			};
			cleanup_expired_2fa_codes: { Args: never; Returns: undefined };
			list_incoming_friend_requests: {
				Args: never;
				Returns: {
					request_id: string;
					requested_at: string;
					requester_avatar_url: string | null;
					requester_email: string | null;
					requester_first_name: string | null;
					requester_last_name: string | null;
					requester_user_id: string;
					requester_username: string | null;
				}[];
			};
			list_outgoing_friend_requests: {
				Args: never;
				Returns: {
					recipient_avatar_url: string | null;
					recipient_email: string | null;
					recipient_first_name: string | null;
					recipient_last_name: string | null;
					recipient_user_id: string;
					recipient_username: string | null;
					request_id: string;
					requested_at: string;
				}[];
			};
			list_my_friends: {
				Args: never;
				Returns: {
					avatar_url: string | null;
					connected_at: string;
					email: string | null;
					first_name: string | null;
					friend_user_id: string;
					last_activity_at: string | null;
					last_name: string | null;
					username: string | null;
				}[];
			};
			get_dashboard_progress_v1: {
				Args: never;
				Returns: {
					phase_action_progress: Json;
					phase1_grammar_choice: string;
					phase1_grammar_started_at: string;
				}[];
			};
			has_pro_access: { Args: { user_email: string }; Returns: boolean };
			has_role: {
				Args: {
					_role: Database["public"]["Enums"]["app_role"];
					_user_id: string;
				};
				Returns: boolean;
			};
			respond_friend_request: {
				Args: { p_action: string; p_request_id: string };
				Returns: {
					friendship_created: boolean;
					status: string;
				}[];
			};
			set_dashboard_phase1_grammar_progress_v1: {
				Args: { p_choice: string; p_started_at?: string };
				Returns: {
					phase1_grammar_choice: string;
					phase1_grammar_started_at: string;
				}[];
			};
			set_dashboard_phase_action_progress_v1: {
				Args: { p_phase_id: string; p_progress: Json };
				Returns: { phase_action_progress: Json }[];
			};
			send_friend_request_by_username: {
				Args: { p_recipient_username: string };
				Returns: {
					friend_request_id: string | null;
					status: string;
				}[];
			};
			track_app_v2_session_unique_visitor: {
				Args: { p_user_id?: string; p_visitor_id: string };
				Returns: undefined;
			};
		};
		Enums: {
			app_role: "admin" | "moderator" | "user";
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
	keyof Database,
	"public"
>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
				DefaultSchema["Views"])
		? (DefaultSchema["Tables"] &
				DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema["Tables"]
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema["Tables"]
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		| keyof DefaultSchema["Enums"]
		| { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
		: never = never,
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
		? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema["CompositeTypes"]
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
		: never = never,
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
		? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {
			app_role: ["admin", "moderator", "user"],
		},
	},
} as const;
