// approval_groups + approval_group_members — matches migration 042.

export interface ApprovalGroup {
  id:          string
  org_id:      string
  name:        string
  description: string | null
  is_active:   boolean
  created_at:  string
  updated_at:  string
}

export interface ApprovalGroupInsert extends Omit<ApprovalGroup, 'id' | 'created_at' | 'updated_at' | 'description' | 'is_active'> {
  id?:          string
  description?: string | null
  is_active?:   boolean
  created_at?:  string
  updated_at?:  string
}
export interface ApprovalGroupUpdate extends Partial<ApprovalGroupInsert> {}

export interface ApprovalGroupMember {
  id:         string
  group_id:   string
  user_id:    string
  created_at: string
}

export interface ApprovalGroupMemberInsert extends Omit<ApprovalGroupMember, 'id' | 'created_at'> {
  id?:         string
  created_at?: string
}
