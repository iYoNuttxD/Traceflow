data "oci_core_instance" "live" { instance_id = var.existing.instance_id }
data "oci_core_subnet" "app" { subnet_id = var.existing.app_subnet_id }
data "oci_core_subnet" "db" { subnet_id = var.existing.db_subnet_id }
data "oci_mysql_mysql_db_system" "live" { db_system_id = var.existing.mysql_id }
data "oci_objectstorage_bucket" "backup" {
  namespace = var.namespace
  name      = var.bucket_name
}
data "oci_core_network_security_group_security_rules" "app" { network_security_group_id = var.existing.app_nsg_id }
data "oci_core_network_security_group_security_rules" "db" { network_security_group_id = var.existing.db_nsg_id }
output "inventory" {
  value = {
    vm_shape          = data.oci_core_instance.live.shape
    mysql_shape       = data.oci_mysql_mysql_db_system.live.shape_name
    db_private_subnet = data.oci_core_subnet.db.prohibit_public_ip_on_vnic
    bucket_private    = data.oci_objectstorage_bucket.backup.access_type
    app_subnet        = data.oci_core_subnet.app.cidr_block
    db_subnet         = data.oci_core_subnet.db.cidr_block
  }
}
