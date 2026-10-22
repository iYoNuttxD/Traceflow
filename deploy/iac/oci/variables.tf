variable "region" {
  type    = string
  default = "sa-saopaulo-1"
}
variable "compartment_id" { type = string }
variable "availability_domain" { type = string }
variable "image_id" { type = string }
variable "manage_resources" {
  type        = bool
  default     = false
  description = "False by default. Enable only in a private imported workspace after exact plan review. No apply authorized in this delivery."
}
variable "name" {
  type    = string
  default = "traceflow"
}
variable "vcn_cidr" {
  type    = string
  default = "10.20.0.0/16"
}
variable "app_cidr" {
  type    = string
  default = "10.20.1.0/24"
}
variable "db_cidr" {
  type    = string
  default = "10.20.2.0/24"
}
variable "admin_cidrs" {
  type = set(string)
  validation {
    condition     = alltrue([for x in var.admin_cidrs : can(regex("/[0-9]+$", x)) && (endswith(x, "/32") || endswith(x, "/128"))])
    error_message = "SSH must be limited to explicit administrative host CIDRs."
  }
}
variable "ssh_public_key" {
  type        = string
  default     = ""
  description = "Public SSH key only. Never a private key or password."
}
variable "mysql_shape" {
  type    = string
  default = "MySQL.Free"
}
variable "mysql_storage_gb" {
  type    = number
  default = 50
}
variable "mysql_backup_id" {
  type        = string
  default     = null
  description = "For an approved rebuild from an existing native OCI backup. New blank DB bootstrap credentials must be provisioned outside shared state."
}
variable "namespace" {
  type    = string
  default = "grcxenfrp09f"
}
variable "bucket_name" {
  type    = string
  default = "traceflow-production-recovery"
}
variable "backup_dynamic_group_name" {
  type    = string
  default = "traceflow-recovery-writer"
}
variable "existing" {
  type        = object({ instance_id = string, app_subnet_id = string, db_subnet_id = string, mysql_id = string, app_nsg_id = string, db_nsg_id = string })
  description = "Only existing resource identifiers; no credentials. Used by the default read-only inventory plan."
}
