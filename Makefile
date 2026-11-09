.DEFAULT_GOAL := help
.PHONY: help setup dev up stop down logs doctor db-migrate db-generate seed seed-full db-reset db-clear test e2e check
help setup dev up stop down logs doctor db-migrate db-generate seed seed-full db-reset db-clear test e2e check:
	@python3 "$(dir $(abspath $(lastword $(MAKEFILE_LIST))))infra/dev/local.py" $@ $(if $(filter db-reset db-clear,$@),$(if $(filter yes,$(CONFIRM)),--confirm,))
