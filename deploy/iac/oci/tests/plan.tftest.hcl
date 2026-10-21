# Mocked planning validates the managed model; this is not a live adoption proof.
mock_provider "oci" {}
variables {
  compartment_id      = "ocid1.compartment.oc1..synthetic"
  availability_domain = "synthetic-ad"
  image_id            = "ocid1.image.oc1..synthetic"
  admin_cidrs         = ["203.0.113.10/32"]
  existing = {
    instance_id   = "ocid1.instance.oc1..synthetic"
    app_subnet_id = "ocid1.subnet.oc1..synthetic-app"
    db_subnet_id  = "ocid1.subnet.oc1..synthetic-db"
    mysql_id      = "ocid1.mysqldbsystem.oc1..synthetic"
    app_nsg_id    = "ocid1.networksecuritygroup.oc1..synthetic-app"
    db_nsg_id     = "ocid1.networksecuritygroup.oc1..synthetic-db"
  }
}
run "inventory_cannot_create_resources" {
  command = plan
  assert {
    condition     = length(oci_core_instance.app) == 0 && length(oci_mysql_mysql_db_system.live) == 0
    error_message = "Default mode must never provision production resources."
  }
}
run "managed_reference_is_private_and_scoped" {
  command = plan
  variables { manage_resources = true }
  assert {
    condition     = oci_core_subnet.db["live"].prohibit_public_ip_on_vnic && oci_core_network_security_group_security_rule.mysql["live"].source == oci_core_network_security_group.app["live"].id
    error_message = "MySQL must stay private and accept only the application NSG."
  }
  assert {
    condition     = oci_objectstorage_bucket.backup["live"].access_type == "NoPublicAccess" && oci_core_instance.app["live"].shape == "VM.Standard.A1.Flex"
    error_message = "Private bucket and ARM64 application model required."
  }
}
