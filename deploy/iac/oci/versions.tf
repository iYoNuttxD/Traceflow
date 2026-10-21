terraform {
  required_version = ">= 1.11, < 2.0"
  required_providers {
    oci = { source = "oracle/oci", version = "9.10.0" }
  }
}
provider "oci" {
  region = var.region
}
