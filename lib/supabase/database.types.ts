
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
                           }
          }
          Enums: {
            "account_type": "owner"|"shelter"|"breeder","app_locale": "sr-Latn"|"en","approval_status": "pending"|"approved"|"rejected","breeding_status": "active"|"retired","data_export_status": "preparing"|"ready"|"failed"|"expired","feeding_type": "dry"|"wet"|"treat"|"home_made"|"other","invitation_status": "pending"|"accepted"|"declined"|"expired","memorial_reason": "passed_away"|"rehomed"|"lost","neutered_status": "yes"|"no"|"unknown","offspring_status": "available"|"reserved"|"sold","organisation_role": "admin"|"volunteer","organisation_type": "shelter"|"breeder","payment_kind": "initial"|"renewal","payment_result": "succeeded"|"failed","pet_lifecycle": "active"|"memorial","pet_sex": "male"|"female"|"unknown","pet_species": "dog"|"cat"|"rabbit"|"hamster"|"guinea_pig"|"chinchilla"|"ferret"|"bird"|"fish"|"turtle"|"lizard"|"snake"|"other","shelter_status": "intake"|"in_care"|"available"|"reserved"|"adopted"|"deceased"|"returned_to_owner","stool_consistency": "normal"|"soft"|"diarrhoea"|"hard","subscription_plan": "premium_monthly"|"premium_yearly"|"breeder_monthly"|"breeder_yearly","subscription_status": "trialing"|"active"|"cancelled"|"expired"|"payment_failed","treatment_interval_unit": "hours"|"days","treatment_type": "medication"|"deworming"|"flea_tick"|"other","weight_unit": "kg"|"g"
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
            "account_type": ["owner", "shelter", "breeder"],"app_locale": ["sr-Latn", "en"],"approval_status": ["pending", "approved", "rejected"],"breeding_status": ["active", "retired"],"data_export_status": ["preparing", "ready", "failed", "expired"],"feeding_type": ["dry", "wet", "treat", "home_made", "other"],"invitation_status": ["pending", "accepted", "declined", "expired"],"memorial_reason": ["passed_away", "rehomed", "lost"],"neutered_status": ["yes", "no", "unknown"],"offspring_status": ["available", "reserved", "sold"],"organisation_role": ["admin", "volunteer"],"organisation_type": ["shelter", "breeder"],"payment_kind": ["initial", "renewal"],"payment_result": ["succeeded", "failed"],"pet_lifecycle": ["active", "memorial"],"pet_sex": ["male", "female", "unknown"],"pet_species": ["dog", "cat", "rabbit", "hamster", "guinea_pig", "chinchilla", "ferret", "bird", "fish", "turtle", "lizard", "snake", "other"],"shelter_status": ["intake", "in_care", "available", "reserved", "adopted", "deceased", "returned_to_owner"],"stool_consistency": ["normal", "soft", "diarrhoea", "hard"],"subscription_plan": ["premium_monthly", "premium_yearly", "breeder_monthly", "breeder_yearly"],"subscription_status": ["trialing", "active", "cancelled", "expired", "payment_failed"],"treatment_interval_unit": ["hours", "days"],"treatment_type": ["medication", "deworming", "flea_tick", "other"],"weight_unit": ["kg", "g"]
          }
        }
} as const
