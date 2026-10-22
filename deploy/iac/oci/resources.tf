# Managed model is disabled in the default inventory-only mode. No resource apply
# is authorized. Existing resources must be imported into private encrypted state
# and produce a reviewed no-change plan before any future management adoption.
locals { enabled = var.manage_resources ? { live = true } : {} }
resource "oci_core_vcn" "live" {
  for_each       = local.enabled
  compartment_id = var.compartment_id
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "${var.name}-vcn"
  dns_label      = "traceflowvcn"
  lifecycle { prevent_destroy = true }
}
resource "oci_core_internet_gateway" "live" {
  for_each       = local.enabled
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.live[each.key].id
  display_name   = "${var.name}-internet"
  enabled        = true
  lifecycle { prevent_destroy = true }
}
resource "oci_core_route_table" "app" {
  for_each       = local.enabled
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.live[each.key].id
  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.live[each.key].id
  }
  lifecycle { prevent_destroy = true }
}
resource "oci_core_security_list" "private_baseline" {
  for_each       = local.enabled
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.live[each.key].id
  display_name   = "${var.name}-nsg-controlled"
  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }
  ingress_security_rules {
    source   = var.vcn_cidr
    protocol = "1"
    icmp_options { type = 3 }
  }
  lifecycle { prevent_destroy = true }
}
resource "oci_core_network_security_group" "app" {
  for_each       = local.enabled
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.live[each.key].id
  display_name   = "${var.name}-app"
  lifecycle { prevent_destroy = true }
}
resource "oci_core_network_security_group" "db" {
  for_each       = local.enabled
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.live[each.key].id
  display_name   = "${var.name}-mysql"
  lifecycle { prevent_destroy = true }
}
resource "oci_core_network_security_group_security_rule" "https" {
  for_each                  = var.manage_resources ? toset(["80", "443"]) : toset([])
  network_security_group_id = oci_core_network_security_group.app["live"].id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = tonumber(each.value)
      max = tonumber(each.value)
    }
  }
}
resource "oci_core_network_security_group_security_rule" "ssh" {
  for_each                  = var.manage_resources ? var.admin_cidrs : toset([])
  network_security_group_id = oci_core_network_security_group.app["live"].id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = each.value
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}
resource "oci_core_network_security_group_security_rule" "mysql" {
  for_each                  = local.enabled
  network_security_group_id = oci_core_network_security_group.db[each.key].id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.app[each.key].id
  source_type               = "NETWORK_SECURITY_GROUP"
  tcp_options {
    destination_port_range {
      min = 3306
      max = 3306
    }
  }
}
resource "oci_core_network_security_group_security_rule" "egress" {
  for_each                  = var.manage_resources ? toset(["app", "db"]) : toset([])
  network_security_group_id = each.value == "app" ? oci_core_network_security_group.app["live"].id : oci_core_network_security_group.db["live"].id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
}
resource "oci_core_subnet" "app" {
  for_each                   = local.enabled
  compartment_id             = var.compartment_id
  vcn_id                     = oci_core_vcn.live[each.key].id
  cidr_block                 = var.app_cidr
  display_name               = "${var.name}-app"
  dns_label                  = "sub10120424530"
  route_table_id             = oci_core_route_table.app[each.key].id
  security_list_ids          = [oci_core_security_list.private_baseline[each.key].id]
  prohibit_public_ip_on_vnic = false
  lifecycle { prevent_destroy = true }
}
resource "oci_core_subnet" "db" {
  for_each                   = local.enabled
  compartment_id             = var.compartment_id
  vcn_id                     = oci_core_vcn.live[each.key].id
  cidr_block                 = var.db_cidr
  display_name               = "${var.name}-mysql-private"
  dns_label                  = "sub10120424531"
  security_list_ids          = [oci_core_security_list.private_baseline[each.key].id]
  prohibit_public_ip_on_vnic = true
  lifecycle { prevent_destroy = true }
}
resource "oci_core_instance" "app" {
  for_each             = local.enabled
  compartment_id       = var.compartment_id
  availability_domain  = var.availability_domain
  display_name         = "${var.name}-app"
  shape                = "VM.Standard.A1.Flex"
  preserve_boot_volume = true
  shape_config {
    ocpus         = 2
    memory_in_gbs = 12
  }
  source_details {
    source_type = "image"
    source_id   = var.image_id
  }
  create_vnic_details {
    subnet_id        = oci_core_subnet.app[each.key].id
    assign_public_ip = true
    nsg_ids          = [oci_core_network_security_group.app[each.key].id]
  }
  metadata = { ssh_authorized_keys = var.ssh_public_key, user_data = filebase64("${path.module}/cloud-init.yaml") }
  lifecycle { prevent_destroy = true }
}
resource "oci_mysql_mysql_db_system" "live" {
  for_each                = local.enabled
  compartment_id          = var.compartment_id
  availability_domain     = var.availability_domain
  subnet_id               = oci_core_subnet.db[each.key].id
  shape_name              = var.mysql_shape
  display_name            = "${var.name}-db"
  hostname_label          = "traceflow-db"
  data_storage_size_in_gb = var.mysql_storage_gb
  nsg_ids                 = [oci_core_network_security_group.db[each.key].id]
  is_highly_available     = false
  backup_policy {
    is_enabled        = true
    retention_in_days = 1
  }
  dynamic "source" {
    for_each = var.mysql_backup_id == null ? [] : [var.mysql_backup_id]
    content {
      source_type = "BACKUP"
      backup_id   = source.value
    }
  }
  lifecycle { prevent_destroy = true }
}
resource "oci_objectstorage_bucket" "backup" {
  for_each       = local.enabled
  compartment_id = var.compartment_id
  namespace      = var.namespace
  name           = var.bucket_name
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
  versioning     = "Disabled"
  lifecycle { prevent_destroy = true }
}
resource "oci_identity_dynamic_group" "backup" {
  for_each       = local.enabled
  compartment_id = var.compartment_id
  name           = var.backup_dynamic_group_name
  description    = "Existing VM backup principal - preserve legacy policies separately"
  matching_rule  = "ALL {instance.id = '${oci_core_instance.app[each.key].id}'}"
  lifecycle { prevent_destroy = true }
}
resource "oci_identity_policy" "backup" {
  for_each       = local.enabled
  compartment_id = var.compartment_id
  name           = "traceflow-live-backup-objects"
  description    = "Clean production prefix only, no overwrite permission"
  statements     = ["Allow dynamic-group ${var.backup_dynamic_group_name} to manage objects in tenancy where all {request.principal.id = '${oci_core_instance.app[each.key].id}', target.bucket.name = '${var.bucket_name}', target.object.name = 'production-live-v1/*', any {request.permission = 'OBJECT_CREATE', request.permission = 'OBJECT_READ', request.permission = 'OBJECT_DELETE'}}"]
  lifecycle { prevent_destroy = true }
}
