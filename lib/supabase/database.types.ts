
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
            "adoption_requests": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"email": string,"id": string,"message": string | null,"name": string,"pet_id": string,"phone": string,"requester_id": string,"status": Database["public"]['Enums']["request_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"email": string,"id"?: string,"message"?: string | null,"name": string,"pet_id": string,"phone": string,"requester_id": string,"status"?: Database["public"]['Enums']["request_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"email"?: string,"id"?: string,"message"?: string | null,"name"?: string,"pet_id"?: string,"phone"?: string,"requester_id"?: string,"status"?: Database["public"]['Enums']["request_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "adoption_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "adoption_requests_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "adoption_requests_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"app_settings": {
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
                },"attachments": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_name": string | null,"id": string,"mime_type": string,"pet_id": string,"r2_key": string,"size_bytes": number,"updated_at": string,"vet_visit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_name"?: string | null,"id"?: string,"mime_type": string,"pet_id": string,"r2_key": string,"size_bytes": number,"updated_at"?: string,"vet_visit_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_name"?: string | null,"id"?: string,"mime_type"?: string,"pet_id"?: string,"r2_key"?: string,"size_bytes"?: number,"updated_at"?: string,"vet_visit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_vet_visit_id_fkey"
      columns: ["vet_visit_id"]
isOneToOne: false
      referencedRelation: "vet_visits"
      referencedColumns: ["id"]
    }
                  ]
                },"breeder_inquiries": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"email": string,"id": string,"message": string | null,"name": string,"pet_id": string,"phone": string,"requester_id": string,"status": Database["public"]['Enums']["request_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"email": string,"id"?: string,"message"?: string | null,"name": string,"pet_id": string,"phone": string,"requester_id": string,"status"?: Database["public"]['Enums']["request_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"email"?: string,"id"?: string,"message"?: string | null,"name"?: string,"pet_id"?: string,"phone"?: string,"requester_id"?: string,"status"?: Database["public"]['Enums']["request_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "breeder_inquiries_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "breeder_inquiries_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "breeder_inquiries_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
                },"dose_logs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"given_at": string,"id": string,"occurrence_id": string | null,"treatment_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"given_at": string,"id"?: string,"occurrence_id"?: string | null,"treatment_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"given_at"?: string,"id"?: string,"occurrence_id"?: string | null,"treatment_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dose_logs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dose_logs_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: true
      referencedRelation: "reminder_occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dose_logs_treatment_id_fkey"
      columns: ["treatment_id"]
isOneToOne: false
      referencedRelation: "treatments"
      referencedColumns: ["id"]
    }
                  ]
                },"feeding_entries": {
                  Row: {
                    "amount_g": number | null,"brand": string | null,"created_at": string,"created_by": string | null,"fed_at": string,"id": string,"note": string | null,"pet_id": string,"type": Database["public"]['Enums']["feeding_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_g"?: number | null,"brand"?: string | null,"created_at"?: string,"created_by"?: string | null,"fed_at": string,"id"?: string,"note"?: string | null,"pet_id": string,"type": Database["public"]['Enums']["feeding_type"],"updated_at"?: string
                  }
                  Update: {
                    "amount_g"?: number | null,"brand"?: string | null,"created_at"?: string,"created_by"?: string | null,"fed_at"?: string,"id"?: string,"note"?: string | null,"pet_id"?: string,"type"?: Database["public"]['Enums']["feeding_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feeding_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feeding_entries_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    }
                  ]
                },"household_invitations": {
                  Row: {
                    "accepted_by": string | null,"created_at": string,"decided_at": string | null,"email": string | null,"expires_at": string,"household_id": string,"id": string,"status": Database["public"]['Enums']["invitation_status"],"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_by"?: string | null,"created_at"?: string,"decided_at"?: string | null,"email"?: string | null,"expires_at"?: string,"household_id": string,"id"?: string,"status"?: Database["public"]['Enums']["invitation_status"],"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_by"?: string | null,"created_at"?: string,"decided_at"?: string | null,"email"?: string | null,"expires_at"?: string,"household_id"?: string,"id"?: string,"status"?: Database["public"]['Enums']["invitation_status"],"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "household_invitations_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"household_memberships": {
                  Row: {
                    "created_at": string,"household_id": string,"id": string,"joined_at": string,"reminders_enabled": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"id"?: string,"joined_at"?: string,"reminders_enabled"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"id"?: string,"joined_at"?: string,"reminders_enabled"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_memberships_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "household_memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"household_pets": {
                  Row: {
                    "created_at": string,"household_id": string,"pet_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"pet_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"pet_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_pets_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "household_pets_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"owner_id": string | null,"read_only": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"owner_id"?: string | null,"read_only"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string | null,"read_only"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "households_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: true
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
                },"intakes": {
                  Row: {
                    "arrival_type": Database["public"]['Enums']["arrival_type"],"created_at": string,"created_by": string | null,"id": string,"intake_on": string,"note": string | null,"pet_id": string,"place_found": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "arrival_type": Database["public"]['Enums']["arrival_type"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"intake_on": string,"note"?: string | null,"pet_id": string,"place_found"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "arrival_type"?: Database["public"]['Enums']["arrival_type"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"intake_on"?: string,"note"?: string | null,"pet_id"?: string,"place_found"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "intakes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "intakes_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: true
      referencedRelation: "pets"
      referencedColumns: ["id"]
    }
                  ]
                },"litters": {
                  Row: {
                    "born_on": string,"created_at": string,"father_id": string | null,"father_name": string | null,"id": string,"mother_id": string,"offspring_count": number,"organisation_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "born_on": string,"created_at"?: string,"father_id"?: string | null,"father_name"?: string | null,"id"?: string,"mother_id": string,"offspring_count": number,"organisation_id": string,"updated_at"?: string
                  }
                  Update: {
                    "born_on"?: string,"created_at"?: string,"father_id"?: string | null,"father_name"?: string | null,"id"?: string,"mother_id"?: string,"offspring_count"?: number,"organisation_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "litters_father_id_fkey"
      columns: ["father_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "litters_mother_id_fkey"
      columns: ["mother_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "litters_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    }
                  ]
                },"memorial_records": {
                  Row: {
                    "created_at": string,"date": string,"id": string,"note": string | null,"pet_id": string,"reason": Database["public"]['Enums']["memorial_reason"] | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date": string,"id"?: string,"note"?: string | null,"pet_id": string,"reason"?: Database["public"]['Enums']["memorial_reason"] | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"id"?: string,"note"?: string | null,"pet_id"?: string,"reason"?: Database["public"]['Enums']["memorial_reason"] | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memorial_records_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: true
      referencedRelation: "pets"
      referencedColumns: ["id"]
    }
                  ]
                },"moment_photos": {
                  Row: {
                    "created_at": string,"id": string,"moment_id": string,"position": number,"r2_key": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"moment_id": string,"position": number,"r2_key": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"moment_id"?: string,"position"?: number,"r2_key"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "moment_photos_moment_id_fkey"
      columns: ["moment_id"]
isOneToOne: false
      referencedRelation: "moments"
      referencedColumns: ["id"]
    }
                  ]
                },"moment_public_links": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"moment_id": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"moment_id": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"moment_id"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "moment_public_links_moment_id_fkey"
      columns: ["moment_id"]
isOneToOne: true
      referencedRelation: "moments"
      referencedColumns: ["id"]
    }
                  ]
                },"moments": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"moment_date": string,"pet_id": string,"text": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"moment_date": string,"pet_id": string,"text"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"moment_date"?: string,"pet_id"?: string,"text"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "moments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moments_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    }
                  ]
                },"organisation_invitations": {
                  Row: {
                    "accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"organisation_id": string,"role": Database["public"]['Enums']["organisation_role"],"status": Database["public"]['Enums']["invitation_status"],"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"organisation_id": string,"role": Database["public"]['Enums']["organisation_role"],"status"?: Database["public"]['Enums']["invitation_status"],"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"organisation_id"?: string,"role"?: Database["public"]['Enums']["organisation_role"],"status"?: Database["public"]['Enums']["invitation_status"],"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organisation_invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_invitations_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    }
                  ]
                },"organisation_memberships": {
                  Row: {
                    "created_at": string,"id": string,"organisation_id": string,"role": Database["public"]['Enums']["organisation_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organisation_id": string,"role": Database["public"]['Enums']["organisation_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organisation_id"?: string,"role"?: Database["public"]['Enums']["organisation_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organisation_memberships_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organisations": {
                  Row: {
                    "approval_status": Database["public"]['Enums']["approval_status"],"city_id": string | null,"created_at": string,"created_by": string | null,"description": string | null,"email": string | null,"id": string,"logo_r2_key": string | null,"name": string,"phone": string | null,"registration_note": string | null,"rejection_reason": string | null,"slug": string,"tax_id": string | null,"type": Database["public"]['Enums']["organisation_type"],"updated_at": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_status"?: Database["public"]['Enums']["approval_status"],"city_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"email"?: string | null,"id"?: string,"logo_r2_key"?: string | null,"name": string,"phone"?: string | null,"registration_note"?: string | null,"rejection_reason"?: string | null,"slug": string,"tax_id"?: string | null,"type": Database["public"]['Enums']["organisation_type"],"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "approval_status"?: Database["public"]['Enums']["approval_status"],"city_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"email"?: string | null,"id"?: string,"logo_r2_key"?: string | null,"name"?: string,"phone"?: string | null,"registration_note"?: string | null,"rejection_reason"?: string | null,"slug"?: string,"tax_id"?: string | null,"type"?: Database["public"]['Enums']["organisation_type"],"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organisations_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_clicks": {
                  Row: {
                    "action": Database["public"]['Enums']["partner_click_action"],"clicked_at": string,"created_at": string,"id": string,"partner_id": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["partner_click_action"],"clicked_at"?: string,"created_at"?: string,"id"?: string,"partner_id": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["partner_click_action"],"clicked_at"?: string,"created_at"?: string,"id"?: string,"partner_id"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_clicks_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_clicks_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_hours": {
                  Row: {
                    "closes": string,"created_at": string,"id": string,"opens": string,"partner_id": string,"updated_at": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "closes": string,"created_at"?: string,"id"?: string,"opens": string,"partner_id": string,"updated_at"?: string,"weekday": number
                  }
                  Update: {
                    "closes"?: string,"created_at"?: string,"id"?: string,"opens"?: string,"partner_id"?: string,"updated_at"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_hours_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"partners": {
                  Row: {
                    "address": string,"city_id": string,"created_at": string,"description": string | null,"email": string | null,"featured": boolean,"id": string,"instagram": string | null,"latitude": number | null,"logo_r2_key": string | null,"longitude": number | null,"message_channel": Database["public"]['Enums']["partner_message_channel"],"message_number": string | null,"name": string,"paid_until": string,"phone": string,"type": Database["public"]['Enums']["partner_type"],"updated_at": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"city_id": string,"created_at"?: string,"description"?: string | null,"email"?: string | null,"featured"?: boolean,"id"?: string,"instagram"?: string | null,"latitude"?: number | null,"logo_r2_key"?: string | null,"longitude"?: number | null,"message_channel"?: Database["public"]['Enums']["partner_message_channel"],"message_number"?: string | null,"name": string,"paid_until": string,"phone": string,"type": Database["public"]['Enums']["partner_type"],"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "address"?: string,"city_id"?: string,"created_at"?: string,"description"?: string | null,"email"?: string | null,"featured"?: boolean,"id"?: string,"instagram"?: string | null,"latitude"?: number | null,"logo_r2_key"?: string | null,"longitude"?: number | null,"message_channel"?: Database["public"]['Enums']["partner_message_channel"],"message_number"?: string | null,"name"?: string,"paid_until"?: string,"phone"?: string,"type"?: Database["public"]['Enums']["partner_type"],"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "partners_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
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
                },"pet_status_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"created_at": string,"id": string,"pet_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"created_at"?: string,"id"?: string,"pet_id": string,"status": string,"updated_at"?: string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"created_at"?: string,"id"?: string,"pet_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pet_status_history_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pet_status_history_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    }
                  ]
                },"pets": {
                  Row: {
                    "approx_age_text": string | null,"birth_date": string | null,"birth_year": number | null,"breed": string | null,"breeding_status": Database["public"]['Enums']["breeding_status"] | null,"colour_markings": string | null,"created_at": string,"id": string,"lifecycle": Database["public"]['Enums']["pet_lifecycle"],"litter_id": string | null,"microchip_number": string | null,"name": string,"neutered": Database["public"]['Enums']["neutered_status"],"note": string | null,"offspring_status": Database["public"]['Enums']["offspring_status"] | null,"organisation_id": string | null,"owner_id": string | null,"passport_number": string | null,"photo_r2_key": string | null,"price_minor": number | null,"public_description": string | null,"sex": Database["public"]['Enums']["pet_sex"],"shelter_status": Database["public"]['Enums']["shelter_status"] | null,"species": Database["public"]['Enums']["pet_species"],"species_other": string | null,"updated_at": string,"vet_name": string | null,"vet_phone": string | null,"weight_unit": Database["public"]['Enums']["weight_unit"]
                  }
                  ComputedFields: never
                  Insert: {
                    "approx_age_text"?: string | null,"birth_date"?: string | null,"birth_year"?: number | null,"breed"?: string | null,"breeding_status"?: Database["public"]['Enums']["breeding_status"] | null,"colour_markings"?: string | null,"created_at"?: string,"id"?: string,"lifecycle"?: Database["public"]['Enums']["pet_lifecycle"],"litter_id"?: string | null,"microchip_number"?: string | null,"name": string,"neutered"?: Database["public"]['Enums']["neutered_status"],"note"?: string | null,"offspring_status"?: Database["public"]['Enums']["offspring_status"] | null,"organisation_id"?: string | null,"owner_id"?: string | null,"passport_number"?: string | null,"photo_r2_key"?: string | null,"price_minor"?: number | null,"public_description"?: string | null,"sex": Database["public"]['Enums']["pet_sex"],"shelter_status"?: Database["public"]['Enums']["shelter_status"] | null,"species": Database["public"]['Enums']["pet_species"],"species_other"?: string | null,"updated_at"?: string,"vet_name"?: string | null,"vet_phone"?: string | null,"weight_unit"?: Database["public"]['Enums']["weight_unit"]
                  }
                  Update: {
                    "approx_age_text"?: string | null,"birth_date"?: string | null,"birth_year"?: number | null,"breed"?: string | null,"breeding_status"?: Database["public"]['Enums']["breeding_status"] | null,"colour_markings"?: string | null,"created_at"?: string,"id"?: string,"lifecycle"?: Database["public"]['Enums']["pet_lifecycle"],"litter_id"?: string | null,"microchip_number"?: string | null,"name"?: string,"neutered"?: Database["public"]['Enums']["neutered_status"],"note"?: string | null,"offspring_status"?: Database["public"]['Enums']["offspring_status"] | null,"organisation_id"?: string | null,"owner_id"?: string | null,"passport_number"?: string | null,"photo_r2_key"?: string | null,"price_minor"?: number | null,"public_description"?: string | null,"sex"?: Database["public"]['Enums']["pet_sex"],"shelter_status"?: Database["public"]['Enums']["shelter_status"] | null,"species"?: Database["public"]['Enums']["pet_species"],"species_other"?: string | null,"updated_at"?: string,"vet_name"?: string | null,"vet_phone"?: string | null,"weight_unit"?: Database["public"]['Enums']["weight_unit"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "pets_litter_id_fkey"
      columns: ["litter_id"]
isOneToOne: false
      referencedRelation: "litters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pets_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pets_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"updated_at": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
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
                },"record_transfers": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"expires_at": string,"from_organisation_id": string,"id": string,"new_pet_id": string | null,"pet_id": string,"recipient_email": string,"status": Database["public"]['Enums']["invitation_status"],"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"expires_at"?: string,"from_organisation_id": string,"id"?: string,"new_pet_id"?: string | null,"pet_id": string,"recipient_email": string,"status"?: Database["public"]['Enums']["invitation_status"],"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"expires_at"?: string,"from_organisation_id"?: string,"id"?: string,"new_pet_id"?: string | null,"pet_id"?: string,"recipient_email"?: string,"status"?: Database["public"]['Enums']["invitation_status"],"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "record_transfers_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "record_transfers_from_organisation_id_fkey"
      columns: ["from_organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "record_transfers_new_pet_id_fkey"
      columns: ["new_pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "record_transfers_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    }
                  ]
                },"reminder_deliveries": {
                  Row: {
                    "channel": Database["public"]['Enums']["delivery_channel"],"created_at": string,"delivered_at": string | null,"error": string | null,"id": string,"occurrence_id": string,"provider_message_id": string | null,"recipient_id": string,"status": Database["public"]['Enums']["delivery_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": Database["public"]['Enums']["delivery_channel"],"created_at"?: string,"delivered_at"?: string | null,"error"?: string | null,"id"?: string,"occurrence_id": string,"provider_message_id"?: string | null,"recipient_id": string,"status": Database["public"]['Enums']["delivery_status"],"updated_at"?: string
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["delivery_channel"],"created_at"?: string,"delivered_at"?: string | null,"error"?: string | null,"id"?: string,"occurrence_id"?: string,"provider_message_id"?: string | null,"recipient_id"?: string,"status"?: Database["public"]['Enums']["delivery_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_deliveries_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "reminder_occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_deliveries_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reminder_occurrences": {
                  Row: {
                    "created_at": string,"done_at": string | null,"done_by": string | null,"due_at": string,"id": string,"notify_at": string,"reminder_id": string,"resent_at": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["occurrence_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"done_at"?: string | null,"done_by"?: string | null,"due_at": string,"id"?: string,"notify_at": string,"reminder_id": string,"resent_at"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["occurrence_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"done_at"?: string | null,"done_by"?: string | null,"due_at"?: string,"id"?: string,"notify_at"?: string,"reminder_id"?: string,"resent_at"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["occurrence_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_occurrences_done_by_fkey"
      columns: ["done_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_occurrences_reminder_id_fkey"
      columns: ["reminder_id"]
isOneToOne: false
      referencedRelation: "reminders"
      referencedColumns: ["id"]
    }
                  ]
                },"reminder_preferences": {
                  Row: {
                    "channels": (Database["public"]['Enums']["delivery_channel"])[],"created_at": string,"delivery_time": string | null,"id": string,"lead_minutes": (number)[],"type": Database["public"]['Enums']["reminder_type"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channels"?: (Database["public"]['Enums']["delivery_channel"])[],"created_at"?: string,"delivery_time"?: string | null,"id"?: string,"lead_minutes"?: (number)[],"type": Database["public"]['Enums']["reminder_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "channels"?: (Database["public"]['Enums']["delivery_channel"])[],"created_at"?: string,"delivery_time"?: string | null,"id"?: string,"lead_minutes"?: (number)[],"type"?: Database["public"]['Enums']["reminder_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reminders": {
                  Row: {
                    "active": boolean,"created_at": string,"ends_at": string | null,"id": string,"interval_value": number | null,"meal_times": (string)[] | null,"meal_weekdays": (number)[] | null,"pet_id": string | null,"recurrence": Database["public"]['Enums']["reminder_recurrence"],"source_id": string | null,"starts_at": string | null,"title": string | null,"type": Database["public"]['Enums']["reminder_type"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"ends_at"?: string | null,"id"?: string,"interval_value"?: number | null,"meal_times"?: (string)[] | null,"meal_weekdays"?: (number)[] | null,"pet_id"?: string | null,"recurrence"?: Database["public"]['Enums']["reminder_recurrence"],"source_id"?: string | null,"starts_at"?: string | null,"title"?: string | null,"type": Database["public"]['Enums']["reminder_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"ends_at"?: string | null,"id"?: string,"interval_value"?: number | null,"meal_times"?: (string)[] | null,"meal_weekdays"?: (number)[] | null,"pet_id"?: string | null,"recurrence"?: Database["public"]['Enums']["reminder_recurrence"],"source_id"?: string | null,"starts_at"?: string | null,"title"?: string | null,"type"?: Database["public"]['Enums']["reminder_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminders_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"stool_entries": {
                  Row: {
                    "blood_or_mucus": boolean,"consistency": Database["public"]['Enums']["stool_consistency"],"created_at": string,"created_by": string | null,"id": string,"note": string | null,"observed_at": string,"pet_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blood_or_mucus"?: boolean,"consistency": Database["public"]['Enums']["stool_consistency"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"observed_at": string,"pet_id": string,"updated_at"?: string
                  }
                  Update: {
                    "blood_or_mucus"?: boolean,"consistency"?: Database["public"]['Enums']["stool_consistency"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"observed_at"?: string,"pet_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stool_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stool_entries_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
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
                },"treatments": {
                  Row: {
                    "created_at": string,"created_by": string | null,"dose": string | null,"ends_on": string | null,"id": string,"interval_unit": Database["public"]['Enums']["treatment_interval_unit"] | null,"interval_value": number | null,"name": string,"note": string | null,"pet_id": string,"starts_on": string,"type": Database["public"]['Enums']["treatment_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"dose"?: string | null,"ends_on"?: string | null,"id"?: string,"interval_unit"?: Database["public"]['Enums']["treatment_interval_unit"] | null,"interval_value"?: number | null,"name": string,"note"?: string | null,"pet_id": string,"starts_on": string,"type": Database["public"]['Enums']["treatment_type"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"dose"?: string | null,"ends_on"?: string | null,"id"?: string,"interval_unit"?: Database["public"]['Enums']["treatment_interval_unit"] | null,"interval_value"?: number | null,"name"?: string,"note"?: string | null,"pet_id"?: string,"starts_on"?: string,"type"?: Database["public"]['Enums']["treatment_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "treatments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "treatments_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    }
                  ]
                },"user_channels": {
                  Row: {
                    "address": string,"channel": Database["public"]['Enums']["user_channel_type"],"created_at": string,"id": string,"opted_in_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"channel": Database["public"]['Enums']["user_channel_type"],"created_at"?: string,"id"?: string,"opted_in_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "address"?: string,"channel"?: Database["public"]['Enums']["user_channel_type"],"created_at"?: string,"id"?: string,"opted_in_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_channels_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"vaccinations": {
                  Row: {
                    "batch_number": string | null,"clinic": string | null,"created_at": string,"created_by": string | null,"given_on": string,"id": string,"name": string,"next_due_on": string | null,"note": string | null,"pet_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_number"?: string | null,"clinic"?: string | null,"created_at"?: string,"created_by"?: string | null,"given_on": string,"id"?: string,"name": string,"next_due_on"?: string | null,"note"?: string | null,"pet_id": string,"updated_at"?: string
                  }
                  Update: {
                    "batch_number"?: string | null,"clinic"?: string | null,"created_at"?: string,"created_by"?: string | null,"given_on"?: string,"id"?: string,"name"?: string,"next_due_on"?: string | null,"note"?: string | null,"pet_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vaccinations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vaccinations_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    }
                  ]
                },"vet_visits": {
                  Row: {
                    "clinic": string | null,"cost_minor": number | null,"created_at": string,"created_by": string | null,"findings": string | null,"follow_up_on": string | null,"id": string,"pet_id": string,"reason": string,"recommendations": string | null,"updated_at": string,"visited_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinic"?: string | null,"cost_minor"?: number | null,"created_at"?: string,"created_by"?: string | null,"findings"?: string | null,"follow_up_on"?: string | null,"id"?: string,"pet_id": string,"reason": string,"recommendations"?: string | null,"updated_at"?: string,"visited_on": string
                  }
                  Update: {
                    "clinic"?: string | null,"cost_minor"?: number | null,"created_at"?: string,"created_by"?: string | null,"findings"?: string | null,"follow_up_on"?: string | null,"id"?: string,"pet_id"?: string,"reason"?: string,"recommendations"?: string | null,"updated_at"?: string,"visited_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vet_visits_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vet_visits_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    }
                  ]
                },"weight_entries": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"measured_on": string,"note": string | null,"pet_id": string,"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"measured_on": string,"note"?: string | null,"pet_id": string,"updated_at"?: string,"value": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"measured_on"?: string,"note"?: string | null,"pet_id"?: string,"updated_at"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "weight_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "weight_entries_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
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
                           },
"partners_nearby":
{ Args: { "p_city_id"?: string,"p_lat"?: number,"p_limit"?: number,"p_lng"?: number,"p_type"?: Database["public"]['Enums']["partner_type"] }; Returns: Json
                           },
"record_partner_click":
{ Args: { "p_action": Database["public"]['Enums']["partner_click_action"],"p_partner_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "account_type": "owner"|"shelter"|"breeder","app_locale": "sr-Latn"|"en","approval_status": "pending"|"approved"|"rejected","arrival_type": "found"|"surrendered"|"confiscated"|"other","breeding_status": "active"|"retired","data_export_status": "preparing"|"ready"|"failed"|"expired","delivery_channel": "email"|"push"|"whatsapp"|"viber","delivery_status": "delivered"|"failed","feeding_type": "dry"|"wet"|"treat"|"home_made"|"other","invitation_status": "pending"|"accepted"|"declined"|"expired","memorial_reason": "passed_away"|"rehomed"|"lost","neutered_status": "yes"|"no"|"unknown","occurrence_status": "pending"|"sent"|"resent"|"done"|"missed","offspring_status": "available"|"reserved"|"sold","organisation_role": "admin"|"volunteer","organisation_type": "shelter"|"breeder","partner_click_action": "call"|"message"|"email"|"website","partner_message_channel": "none"|"sms"|"viber"|"whatsapp","partner_type": "vet"|"pet_shop"|"grooming"|"pet_hotel","payment_kind": "initial"|"renewal","payment_result": "succeeded"|"failed","pet_lifecycle": "active"|"memorial","pet_sex": "male"|"female"|"unknown","pet_species": "dog"|"cat"|"rabbit"|"hamster"|"guinea_pig"|"chinchilla"|"ferret"|"bird"|"fish"|"turtle"|"lizard"|"snake"|"other","reminder_recurrence": "none"|"hourly_interval"|"daily"|"weekly"|"monthly"|"yearly","reminder_type": "vaccination"|"treatment_dose"|"vet_follow_up"|"meal"|"birthday"|"manual","request_status": "pending"|"accepted"|"rejected","shelter_status": "intake"|"in_care"|"available"|"reserved"|"adopted"|"deceased"|"returned_to_owner","stool_consistency": "normal"|"soft"|"diarrhoea"|"hard","subscription_plan": "premium_monthly"|"premium_yearly"|"breeder_monthly"|"breeder_yearly","subscription_status": "trialing"|"active"|"cancelled"|"expired"|"payment_failed","treatment_interval_unit": "hours"|"days","treatment_type": "medication"|"deworming"|"flea_tick"|"other","user_channel_type": "whatsapp"|"viber","weight_unit": "kg"|"g"
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
            "account_type": ["owner", "shelter", "breeder"],"app_locale": ["sr-Latn", "en"],"approval_status": ["pending", "approved", "rejected"],"arrival_type": ["found", "surrendered", "confiscated", "other"],"breeding_status": ["active", "retired"],"data_export_status": ["preparing", "ready", "failed", "expired"],"delivery_channel": ["email", "push", "whatsapp", "viber"],"delivery_status": ["delivered", "failed"],"feeding_type": ["dry", "wet", "treat", "home_made", "other"],"invitation_status": ["pending", "accepted", "declined", "expired"],"memorial_reason": ["passed_away", "rehomed", "lost"],"neutered_status": ["yes", "no", "unknown"],"occurrence_status": ["pending", "sent", "resent", "done", "missed"],"offspring_status": ["available", "reserved", "sold"],"organisation_role": ["admin", "volunteer"],"organisation_type": ["shelter", "breeder"],"partner_click_action": ["call", "message", "email", "website"],"partner_message_channel": ["none", "sms", "viber", "whatsapp"],"partner_type": ["vet", "pet_shop", "grooming", "pet_hotel"],"payment_kind": ["initial", "renewal"],"payment_result": ["succeeded", "failed"],"pet_lifecycle": ["active", "memorial"],"pet_sex": ["male", "female", "unknown"],"pet_species": ["dog", "cat", "rabbit", "hamster", "guinea_pig", "chinchilla", "ferret", "bird", "fish", "turtle", "lizard", "snake", "other"],"reminder_recurrence": ["none", "hourly_interval", "daily", "weekly", "monthly", "yearly"],"reminder_type": ["vaccination", "treatment_dose", "vet_follow_up", "meal", "birthday", "manual"],"request_status": ["pending", "accepted", "rejected"],"shelter_status": ["intake", "in_care", "available", "reserved", "adopted", "deceased", "returned_to_owner"],"stool_consistency": ["normal", "soft", "diarrhoea", "hard"],"subscription_plan": ["premium_monthly", "premium_yearly", "breeder_monthly", "breeder_yearly"],"subscription_status": ["trialing", "active", "cancelled", "expired", "payment_failed"],"treatment_interval_unit": ["hours", "days"],"treatment_type": ["medication", "deworming", "flea_tick", "other"],"user_channel_type": ["whatsapp", "viber"],"weight_unit": ["kg", "g"]
          }
        }
} as const
