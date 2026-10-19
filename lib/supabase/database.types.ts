
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "created_at": string,"id": string,"updated_at": string,"viber_enabled": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"updated_at"?: string,"viber_enabled"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"updated_at"?: string,"viber_enabled"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"cities": {
                  Row: {
                    "created_at": string,"id": string,"latitude": number,"longitude": number,"name_en": string,"name_sr": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"latitude": number,"longitude": number,"name_en": string,"name_sr": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"latitude"?: number,"longitude"?: number,"name_en"?: string,"name_sr"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"data_exports": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"id": string,"r2_key": string | null,"ready_at": string | null,"requested_at": string,"size_bytes": number | null,"status": Database["public"]['Enums']["data_export_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"r2_key"?: string | null,"ready_at"?: string | null,"requested_at"?: string,"size_bytes"?: number | null,"status"?: Database["public"]['Enums']["data_export_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"r2_key"?: string | null,"ready_at"?: string | null,"requested_at"?: string,"size_bytes"?: number | null,"status"?: Database["public"]['Enums']["data_export_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "data_exports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"idempotency_keys": {
                  Row: {
                    "created_at": string,"id": string,"key": string,"operation": string,"result": Json | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"key": string,"operation": string,"result"?: Json | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"key"?: string,"operation"?: string,"result"?: Json | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "idempotency_keys_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_webhook_events": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"provider": string,"received_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"provider": string,"received_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"provider"?: string,"received_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"plans": {
                  Row: {
                    "active": boolean,"code": Database["public"]['Enums']["subscription_plan"],"created_at": string,"currency": string,"id": string,"price_minor": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active": boolean,"code": Database["public"]['Enums']["subscription_plan"],"created_at"?: string,"currency"?: string,"id"?: string,"price_minor": number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"code"?: Database["public"]['Enums']["subscription_plan"],"created_at"?: string,"currency"?: string,"id"?: string,"price_minor"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "account_type": Database["public"]['Enums']["account_type"],"city_id": string | null,"created_at": string,"deletion_due_at": string | null,"deletion_requested_at": string | null,"email": string,"full_name": string | null,"id": string,"is_operator": boolean,"locale": Database["public"]['Enums']["app_locale"],"terms_accepted_at": string,"terms_version": string,"trial_used": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_type": Database["public"]['Enums']["account_type"],"city_id"?: string | null,"created_at"?: string,"deletion_due_at"?: string | null,"deletion_requested_at"?: string | null,"email": string,"full_name"?: string | null,"id": string,"is_operator"?: boolean,"locale"?: Database["public"]['Enums']["app_locale"],"terms_accepted_at": string,"terms_version": string,"trial_used"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "account_type"?: Database["public"]['Enums']["account_type"],"city_id"?: string | null,"created_at"?: string,"deletion_due_at"?: string | null,"deletion_requested_at"?: string | null,"email"?: string,"full_name"?: string | null,"id"?: string,"is_operator"?: boolean,"locale"?: Database["public"]['Enums']["app_locale"],"terms_accepted_at"?: string,"terms_version"?: string,"trial_used"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    }
                  ]
                },"r2_deletion_queue": {
                  Row: {
                    "queued_at": string,"r2_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "queued_at"?: string,"r2_key": string
                  }
                  Update: {
                    "queued_at"?: string,"r2_key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limit_counters": {
                  Row: {
                    "count": number,"created_at": string,"id": string,"operation": string,"updated_at": string,"user_id": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"created_at"?: string,"id"?: string,"operation": string,"updated_at"?: string,"user_id": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"created_at"?: string,"id"?: string,"operation"?: string,"updated_at"?: string,"user_id"?: string,"window_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rate_limit_counters_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_payments": {
                  Row: {
                    "amount_minor": number,"created_at": string,"currency": string,"id": string,"kind": Database["public"]['Enums']["payment_kind"],"monri_transaction_id": string,"result": Database["public"]['Enums']["payment_result"],"subscription_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"currency"?: string,"id"?: string,"kind": Database["public"]['Enums']["payment_kind"],"monri_transaction_id": string,"result": Database["public"]['Enums']["payment_result"],"subscription_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["payment_kind"],"monri_transaction_id"?: string,"result"?: Database["public"]['Enums']["payment_result"],"subscription_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_payments_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "auto_renew": boolean,"card_brand": string | null,"card_last4": string | null,"created_at": string,"current_period_end": string,"id": string,"last_notice_days": number | null,"monri_cit_id": string | null,"monri_token_ref": string | null,"plan": Database["public"]['Enums']["subscription_plan"],"status": Database["public"]['Enums']["subscription_status"],"trial_ends_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_renew"?: boolean,"card_brand"?: string | null,"card_last4"?: string | null,"created_at"?: string,"current_period_end": string,"id"?: string,"last_notice_days"?: number | null,"monri_cit_id"?: string | null,"monri_token_ref"?: string | null,"plan": Database["public"]['Enums']["subscription_plan"],"status": Database["public"]['Enums']["subscription_status"],"trial_ends_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "auto_renew"?: boolean,"card_brand"?: string | null,"card_last4"?: string | null,"created_at"?: string,"current_period_end"?: string,"id"?: string,"last_notice_days"?: number | null,"monri_cit_id"?: string | null,"monri_token_ref"?: string | null,"plan"?: Database["public"]['Enums']["subscription_plan"],"status"?: Database["public"]['Enums']["subscription_status"],"trial_ends_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_premium":
{ Args: { "user_id": string }; Returns: boolean
                           }
          }
          Enums: {
            "account_type": "owner"|"shelter"|"breeder","app_locale": "sr-Latn"|"en","data_export_status": "preparing"|"ready"|"failed"|"expired","payment_kind": "initial"|"renewal","payment_result": "succeeded"|"failed","subscription_plan": "premium_monthly"|"premium_yearly"|"breeder_monthly"|"breeder_yearly","subscription_status": "trialing"|"active"|"cancelled"|"expired"|"payment_failed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_type": ["owner", "shelter", "breeder"],"app_locale": ["sr-Latn", "en"],"data_export_status": ["preparing", "ready", "failed", "expired"],"payment_kind": ["initial", "renewal"],"payment_result": ["succeeded", "failed"],"subscription_plan": ["premium_monthly", "premium_yearly", "breeder_monthly", "breeder_yearly"],"subscription_status": ["trialing", "active", "cancelled", "expired", "payment_failed"]
          }
        }
} as const
