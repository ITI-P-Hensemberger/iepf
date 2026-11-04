.DEFAULT_GOAL := help
.PHONY: help setup dev up stop down logs doctor db-migrate db-generate seed seed-full db-reset test check
help setup dev up stop down logs doctor db-migrate db-generate seed seed-full db-reset test check:
	@python3 "$(dir $(abspath $(lastword $(MAKEFILE_LIST))))dev/local.py" $@ $(if $(filter db-reset,$@),$(if $(filter yes,$(CONFIRM)),--confirm,))
