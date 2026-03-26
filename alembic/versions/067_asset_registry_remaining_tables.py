"""Asset Registry — remaining specialized equipment tables.

Adds ~48 tables to complete the O&G asset data model:
Process columns, PSVs, rupture disks, fired heaters, fans/blowers,
steam turbines, turboexpanders, air compressors, nitrogen units,
fiscal metering, chemical injection, gas dehydration, produced water,
fire & gas, HPU, HVAC, UPS, telecom, switchgear, MCCs, manifolds,
pig stations, downhole completions, gas lift mandrels, ESP assemblies,
subsea equipment (XTs, umbilicals, PLEMs, risers, control systems),
marine loading arms, mooring systems, survival craft, cathodic protection,
buildings, structural elements, utility systems (potable water, sewage,
cooling water, drainage), process filters, separator desalter details,
and installation subtypes (well pad, terminal, tank farm, jacket, buoy).

Revision ID: 067
Revises: 066
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "067"
down_revision = "066"
branch_labels = None
depends_on = None


def upgrade() -> None:

    # ── PROCESS COLUMNS ─────────────────────────────────────────

    op.create_table(
        "ar_process_columns",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("column_type", sa.String(30), nullable=False),
        sa.Column("service_description", sa.String(200)),
        sa.Column("train_id", sa.String(10)),
        sa.Column("shell_id_bottom_mm", sa.Numeric(9, 2), nullable=False),
        sa.Column("shell_id_top_mm", sa.Numeric(9, 2)),
        sa.Column("tan_to_tan_mm", sa.Numeric(10, 2), nullable=False),
        sa.Column("overall_height_mm", sa.Numeric(10, 2)),
        sa.Column("skirt_height_mm", sa.Numeric(8, 2)),
        sa.Column("weight_empty_kg", sa.Numeric(12, 2)),
        sa.Column("weight_operating_kg", sa.Numeric(12, 2)),
        sa.Column("weight_hydrotest_kg", sa.Numeric(12, 2)),
        sa.Column("design_pressure_top_barg", sa.Numeric(9, 3)),
        sa.Column("design_pressure_bottom_barg", sa.Numeric(9, 3)),
        sa.Column("design_temp_max_c", sa.Numeric(7, 2), nullable=False),
        sa.Column("design_temp_min_c", sa.Numeric(7, 2)),
        sa.Column("shell_material", sa.String(100)),
        sa.Column("design_code", sa.String(50)),
        sa.Column("corrosion_allowance_mm", sa.Numeric(5, 2)),
        sa.Column("notes", sa.Text),
    )

    op.create_table(
        "ar_column_sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("column_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_process_columns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section_number", sa.Integer, nullable=False),
        sa.Column("section_name", sa.String(50)),
        sa.Column("internals_type", sa.String(30), nullable=False),
        sa.Column("elevation_bottom_mm", sa.Numeric(9, 2)),
        sa.Column("elevation_top_mm", sa.Numeric(9, 2)),
        sa.Column("tray_count", sa.Integer),
        sa.Column("tray_spacing_mm", sa.Numeric(6, 2)),
        sa.Column("tray_material", sa.String(50)),
        sa.Column("packing_type", sa.String(50)),
        sa.Column("packing_height_m", sa.Numeric(6, 2)),
        sa.Column("notes", sa.Text),
        sa.UniqueConstraint("column_id", "section_number", name="uq_ar_column_sections_num"),
    )
    op.create_index("idx_ar_column_sections_col", "ar_column_sections", ["column_id"])

    # ── PRESSURE SAFETY VALVES ──────────────────────────────────

    op.create_table(
        "ar_pressure_safety_valves",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("psv_type", sa.String(30), nullable=False),
        sa.Column("service_type", sa.String(30)),
        sa.Column("protected_equipment_tag", sa.String(50)),
        sa.Column("set_pressure_barg", sa.Numeric(9, 3), nullable=False),
        sa.Column("back_pressure_barg", sa.Numeric(9, 3)),
        sa.Column("inlet_size_in", sa.Numeric(5, 2)),
        sa.Column("outlet_size_in", sa.Numeric(5, 2)),
        sa.Column("body_material", sa.String(50)),
        sa.Column("design_standard", sa.String(20)),
        sa.Column("test_interval_months", sa.Integer),
    )

    # ── RUPTURE DISKS ───────────────────────────────────────────

    op.create_table(
        "ar_rupture_disks",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("disk_type", sa.String(30)),
        sa.Column("protected_equipment_tag", sa.String(50)),
        sa.Column("burst_pressure_barg", sa.Numeric(9, 3), nullable=False),
        sa.Column("burst_temp_c", sa.Numeric(7, 2)),
        sa.Column("inlet_size_in", sa.Numeric(5, 2)),
        sa.Column("disk_material", sa.String(50)),
        sa.Column("replacement_interval_months", sa.Integer, server_default="24"),
        sa.Column("design_standard", sa.String(20)),
    )

    # ── FIRED HEATERS ───────────────────────────────────────────

    op.create_table(
        "ar_fired_heaters",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("heater_type", sa.String(20), nullable=False),
        sa.Column("service_description", sa.String(200)),
        sa.Column("duty_kw", sa.Numeric(12, 2), nullable=False),
        sa.Column("thermal_efficiency_pct", sa.Numeric(5, 2)),
        sa.Column("fuel_type", sa.String(20)),
        sa.Column("burner_count", sa.Integer),
        sa.Column("design_code", sa.String(20)),
    )

    # ── FANS / BLOWERS ──────────────────────────────────────────

    op.create_table(
        "ar_fans_blowers",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("fan_type", sa.String(30), nullable=False),
        sa.Column("service_description", sa.String(200)),
        sa.Column("flow_rate_m3h", sa.Numeric(10, 3), nullable=False),
        sa.Column("static_pressure_pa", sa.Numeric(8, 2)),
        sa.Column("motor_power_kw", sa.Numeric(7, 2), nullable=False),
        sa.Column("motor_voltage_v", sa.Numeric(7, 2)),
        sa.Column("design_code", sa.String(20)),
    )

    # ── STEAM TURBINES ──────────────────────────────────────────

    op.create_table(
        "ar_steam_turbines",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("turbine_type", sa.String(30), nullable=False),
        sa.Column("application", sa.String(20)),
        sa.Column("inlet_steam_pressure_barg", sa.Numeric(8, 3), nullable=False),
        sa.Column("inlet_steam_temp_c", sa.Numeric(7, 2), nullable=False),
        sa.Column("shaft_power_kw", sa.Numeric(10, 2), nullable=False),
        sa.Column("speed_rpm", sa.Numeric(7, 2)),
        sa.Column("design_code", sa.String(20)),
    )

    # ── TURBOEXPANDERS ──────────────────────────────────────────

    op.create_table(
        "ar_turboexpanders",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("service_description", sa.String(200)),
        sa.Column("application", sa.String(30)),
        sa.Column("inlet_pressure_barg", sa.Numeric(9, 3), nullable=False),
        sa.Column("inlet_temp_c", sa.Numeric(7, 2), nullable=False),
        sa.Column("outlet_pressure_barg", sa.Numeric(9, 3), nullable=False),
        sa.Column("shaft_power_kw", sa.Numeric(8, 2)),
        sa.Column("design_code", sa.String(20)),
    )

    # ── AIR COMPRESSOR PACKAGES ─────────────────────────────────

    op.create_table(
        "ar_air_compressor_packages",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("compressor_type", sa.String(30), nullable=False),
        sa.Column("service", sa.String(20)),
        sa.Column("is_oil_free", sa.Boolean, server_default="true"),
        sa.Column("flow_nm3h", sa.Numeric(8, 3), nullable=False),
        sa.Column("discharge_pressure_barg", sa.Numeric(7, 3), nullable=False),
        sa.Column("motor_power_kw", sa.Numeric(7, 2)),
        sa.Column("design_code", sa.String(20)),
    )

    # ── NITROGEN UNITS ──────────────────────────────────────────

    op.create_table(
        "ar_nitrogen_units",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("n2_type", sa.String(20), nullable=False),
        sa.Column("service", sa.String(100)),
        sa.Column("n2_flow_nm3h", sa.Numeric(8, 3), nullable=False),
        sa.Column("n2_purity_pct", sa.Numeric(7, 5), nullable=False),
        sa.Column("outlet_pressure_barg", sa.Numeric(7, 3), nullable=False),
    )

    # ── FISCAL METERING SKIDS ───────────────────────────────────

    op.create_table(
        "ar_fiscal_metering_skids",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("metering_type", sa.String(25), nullable=False),
        sa.Column("service", sa.String(30), nullable=False),
        sa.Column("custody_transfer", sa.Boolean, server_default="true"),
        sa.Column("design_flow_m3h", sa.Numeric(10, 3)),
        sa.Column("uncertainty_pct", sa.Numeric(5, 4)),
    )

    # ── CHEMICAL INJECTION SKIDS ────────────────────────────────

    op.create_table(
        "ar_chemical_injection_skids",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("chemical_type", sa.String(30), nullable=False),
        sa.Column("chemical_name", sa.String(100)),
        sa.Column("storage_tank_volume_l", sa.Numeric(10, 2)),
        sa.Column("pump_type", sa.String(20)),
        sa.Column("flow_rate_design_lph", sa.Numeric(8, 4)),
        sa.Column("discharge_pressure_barg", sa.Numeric(7, 3)),
    )

    # ── GAS DEHYDRATION UNITS ───────────────────────────────────

    op.create_table(
        "ar_gas_dehydration_units",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("dehydration_type", sa.String(20), nullable=False),
        sa.Column("service", sa.String(100)),
        sa.Column("inlet_flow_mmscfd", sa.Numeric(10, 4)),
        sa.Column("inlet_pressure_barg", sa.Numeric(8, 3)),
        sa.Column("outlet_dewpoint_c", sa.Numeric(7, 2)),
        sa.Column("design_code", sa.String(30)),
    )

    # ── PRODUCED WATER TREATMENT UNITS ──────────────────────────

    op.create_table(
        "ar_produced_water_treatment_units",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("treatment_type", sa.String(25), nullable=False),
        sa.Column("service", sa.String(30)),
        sa.Column("inlet_flow_m3h", sa.Numeric(10, 3), nullable=False),
        sa.Column("outlet_oiw_spec_ppm", sa.Numeric(8, 3)),
        sa.Column("design_code", sa.String(30)),
    )

    # ── FIRE & GAS SYSTEMS ──────────────────────────────────────

    op.create_table(
        "ar_fire_gas_systems",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("system_name", sa.String(100)),
        sa.Column("system_standard", sa.String(30)),
        sa.Column("is_sil_rated", sa.Boolean, server_default="false"),
        sa.Column("sil_level", sa.String(5)),
        sa.Column("total_fire_detectors", sa.Integer),
        sa.Column("total_gas_detectors", sa.Integer),
        sa.Column("design_code", sa.String(30)),
    )

    # ── HPU UNITS ───────────────────────────────────────────────

    op.create_table(
        "ar_hpu_units",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("service", sa.String(100)),
        sa.Column("is_subsea_control", sa.Boolean, server_default="false"),
        sa.Column("system_pressure_barg", sa.Numeric(8, 3), nullable=False),
        sa.Column("pump_count", sa.Integer, server_default="2"),
        sa.Column("reservoir_volume_l", sa.Numeric(8, 2), nullable=False),
        sa.Column("design_code", sa.String(20)),
    )

    # ── HVAC UNITS ──────────────────────────────────────────────

    op.create_table(
        "ar_hvac_units",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("hvac_type", sa.String(25), nullable=False),
        sa.Column("served_area", sa.String(200)),
        sa.Column("cooling_capacity_kw", sa.Numeric(8, 2)),
        sa.Column("heating_capacity_kw", sa.Numeric(8, 2)),
        sa.Column("total_power_kw", sa.Numeric(7, 2)),
        sa.Column("design_code", sa.String(20)),
    )

    # ── UPS SYSTEMS ─────────────────────────────────────────────

    op.create_table(
        "ar_ups_systems",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("ups_type", sa.String(30), nullable=False),
        sa.Column("critical_load_served", sa.String(200)),
        sa.Column("rated_power_kva", sa.Numeric(8, 2), nullable=False),
        sa.Column("battery_type", sa.String(20)),
        sa.Column("backup_time_min_at_full_load", sa.Integer),
        sa.Column("design_code", sa.String(30)),
    )

    # ── TELECOM SYSTEMS ─────────────────────────────────────────

    op.create_table(
        "ar_telecom_systems",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("telecom_type", sa.String(20), nullable=False),
        sa.Column("is_safety_critical", sa.Boolean, server_default="false"),
        sa.Column("system_description", sa.String(200)),
        sa.Column("coverage_area", sa.String(200)),
    )

    # ── SWITCHGEAR ──────────────────────────────────────────────

    op.create_table(
        "ar_switchgear",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("switchgear_type", sa.String(15)),
        sa.Column("voltage_class", sa.String(10)),
        sa.Column("rated_voltage_v", sa.Numeric(9, 2), nullable=False),
        sa.Column("rated_current_a", sa.Numeric(9, 2)),
        sa.Column("design_code", sa.String(20)),
    )

    # ── MOTOR CONTROL CENTERS ───────────────────────────────────

    op.create_table(
        "ar_motor_control_centers",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("voltage_v", sa.Numeric(8, 2), nullable=False),
        sa.Column("frequency_hz", sa.Numeric(5, 2), server_default="50"),
        sa.Column("number_of_modules", sa.Integer),
        sa.Column("design_code", sa.String(20)),
    )

    # ── MANIFOLDS ───────────────────────────────────────────────

    op.create_table(
        "ar_manifolds",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("manifold_type", sa.String(20)),
        sa.Column("number_of_inlets", sa.Integer),
        sa.Column("number_of_outlets", sa.Integer),
        sa.Column("header_size_in", sa.Numeric(6, 2), nullable=False),
        sa.Column("design_pressure_barg", sa.Numeric(9, 3), nullable=False),
        sa.Column("is_subsea", sa.Boolean, server_default="false"),
        sa.Column("design_code", sa.String(20)),
    )

    # ── PIG STATIONS ────────────────────────────────────────────

    op.create_table(
        "ar_pig_stations",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("station_type", sa.String(15), nullable=False),
        sa.Column("pipeline_tag", sa.String(50)),
        sa.Column("barrel_id_in", sa.Numeric(7, 2), nullable=False),
        sa.Column("design_pressure_barg", sa.Numeric(9, 3), nullable=False),
        sa.Column("design_code", sa.String(20)),
    )

    # ── DOWNHOLE COMPLETIONS ────────────────────────────────────

    op.create_table(
        "ar_downhole_completions",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("well_tag", sa.String(50), nullable=False),
        sa.Column("well_name", sa.String(100)),
        sa.Column("completion_type", sa.String(20)),
        sa.Column("completion_date", sa.Date),
        sa.Column("tubing_od_in", sa.Numeric(5, 3)),
        sa.Column("tubing_string_depth_m", sa.Numeric(10, 2)),
        sa.Column("notes", sa.Text),
    )

    op.create_table(
        "ar_gas_lift_mandrels",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("completion_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_downhole_completions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mandrel_number", sa.Integer, nullable=False),
        sa.Column("mandrel_depth_md_m", sa.Numeric(10, 2), nullable=False),
        sa.Column("valve_type", sa.String(10)),
        sa.Column("dome_pressure_psig", sa.Numeric(8, 2)),
        sa.UniqueConstraint("completion_id", "mandrel_number", name="uq_ar_gas_lift_mandrels_num"),
    )
    op.create_index("idx_ar_gas_lift_mandrels_comp", "ar_gas_lift_mandrels", ["completion_id"])

    op.create_table(
        "ar_esp_assemblies",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("completion_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_downhole_completions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pump_manufacturer", sa.String(50)),
        sa.Column("pump_model", sa.String(50)),
        sa.Column("pump_stages", sa.Integer),
        sa.Column("pump_setting_depth_md_m", sa.Numeric(10, 2)),
        sa.Column("motor_rated_power_kw", sa.Numeric(7, 2)),
        sa.Column("installation_date", sa.Date),
    )
    op.create_index("idx_ar_esp_assemblies_comp", "ar_esp_assemblies", ["completion_id"])

    # ── SUBSEA EQUIPMENT ────────────────────────────────────────

    op.create_table(
        "ar_subsea_christmas_trees",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("well_tag", sa.String(50)),
        sa.Column("xt_type", sa.String(20)),
        sa.Column("xt_pressure_rating_psi", sa.Numeric(9, 2)),
        sa.Column("water_depth_m", sa.Numeric(8, 2)),
        sa.Column("design_life_years", sa.Integer),
    )

    op.create_table(
        "ar_subsea_umbilicals",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("umbilical_type", sa.String(20)),
        sa.Column("function", sa.String(20)),
        sa.Column("installed_length_m", sa.Numeric(10, 2)),
        sa.Column("water_depth_max_m", sa.Numeric(8, 2)),
        sa.Column("design_life_years", sa.Integer),
    )

    op.create_table(
        "ar_subsea_plem_plet",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("structure_type", sa.String(5)),
        sa.Column("water_depth_m", sa.Numeric(8, 2)),
        sa.Column("design_pressure_barg", sa.Numeric(9, 3)),
        sa.Column("pipeline_size_in", sa.Numeric(5, 2)),
    )

    op.create_table(
        "ar_risers",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("riser_type", sa.String(20)),
        sa.Column("service", sa.String(30)),
        sa.Column("installed_length_m", sa.Numeric(10, 2)),
        sa.Column("nominal_od_in", sa.Numeric(6, 2)),
        sa.Column("design_pressure_barg", sa.Numeric(9, 3)),
        sa.Column("design_life_years", sa.Integer),
    )

    op.create_table(
        "ar_subsea_control_systems",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("system_type", sa.String(15)),
        sa.Column("manufacturer", sa.String(50)),
        sa.Column("number_of_wells_controlled", sa.Integer),
    )

    # ── MARINE / LOADING ────────────────────────────────────────

    op.create_table(
        "ar_marine_loading_arms",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("mla_type", sa.String(25)),
        sa.Column("service", sa.String(30)),
        sa.Column("rated_flow_m3h", sa.Numeric(10, 3)),
        sa.Column("arm_size_in", sa.Numeric(5, 2)),
        sa.Column("design_pressure_barg", sa.Numeric(8, 3)),
        sa.Column("design_code", sa.String(20)),
    )

    op.create_table(
        "ar_mooring_systems",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("system_type", sa.String(20)),
        sa.Column("water_depth_m", sa.Numeric(8, 2)),
        sa.Column("number_of_lines", sa.Integer),
        sa.Column("design_standard", sa.String(30)),
    )

    op.create_table(
        "ar_survival_craft",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("craft_type", sa.String(30), nullable=False),
        sa.Column("purpose", sa.String(15)),
        sa.Column("person_capacity", sa.Integer),
        sa.Column("solas_compliant", sa.Boolean, server_default="true"),
    )

    # ── CORROSION PROTECTION ────────────────────────────────────

    op.create_table(
        "ar_cathodic_protection_systems",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("cp_type", sa.String(20), nullable=False),
        sa.Column("protected_structure_tag", sa.String(50)),
        sa.Column("design_life_years", sa.Integer, nullable=False),
        sa.Column("anode_material", sa.String(25)),
        sa.Column("design_standard", sa.String(30)),
    )

    # ── BUILDINGS & STRUCTURAL ──────────────────────────────────

    op.create_table(
        "ar_buildings",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("building_type", sa.String(25), nullable=False),
        sa.Column("floor_area_m2", sa.Numeric(9, 2)),
        sa.Column("floor_count", sa.Integer, server_default="1"),
        sa.Column("is_blast_resistant", sa.Boolean, server_default="false"),
        sa.Column("is_fire_rated", sa.Boolean, server_default="false"),
    )

    op.create_table(
        "ar_structural_elements",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("structural_type", sa.String(25), nullable=False),
        sa.Column("parent_structure_tag", sa.String(50)),
        sa.Column("material", sa.String(30)),
        sa.Column("design_standard", sa.String(30)),
        sa.Column("weight_tonnes", sa.Numeric(9, 2)),
    )

    # ── UTILITY SYSTEMS ─────────────────────────────────────────

    op.create_table(
        "ar_potable_water_systems",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("production_type", sa.String(20)),
        sa.Column("capacity_m3d", sa.Numeric(8, 3)),
        sa.Column("storage_capacity_m3", sa.Numeric(8, 3)),
    )

    op.create_table(
        "ar_sewage_treatment_systems",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("system_type", sa.String(25)),
        sa.Column("capacity_m3d", sa.Numeric(7, 3)),
        sa.Column("marpol_compliant", sa.Boolean, server_default="true"),
    )

    op.create_table(
        "ar_cooling_water_systems",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("system_type", sa.String(20)),
        sa.Column("cooling_medium", sa.String(20)),
        sa.Column("total_flow_m3h", sa.Numeric(10, 3)),
    )

    op.create_table(
        "ar_drainage_systems",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("system_type", sa.String(20)),
        sa.Column("service_area", sa.String(200)),
        sa.Column("design_capacity_m3h", sa.Numeric(8, 3)),
        sa.Column("design_code", sa.String(20)),
    )

    # ── PROCESS FILTERS ─────────────────────────────────────────

    op.create_table(
        "ar_process_filters",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("filter_type", sa.String(25), nullable=False),
        sa.Column("service_description", sa.String(200)),
        sa.Column("design_pressure_barg", sa.Numeric(9, 3), nullable=False),
        sa.Column("design_flow_m3h", sa.Numeric(9, 3)),
        sa.Column("filtration_rating_micron", sa.Numeric(8, 3)),
        sa.Column("design_code", sa.String(20)),
    )

    # ── SEPARATOR DESALTER DETAILS (child of ar_separators) ─────

    op.create_table(
        "ar_separator_desalter_details",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_separators.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("electric_field_type", sa.String(10)),
        sa.Column("electrode_voltage_kv", sa.Numeric(8, 3)),
        sa.Column("number_of_stages", sa.Integer, server_default="1"),
        sa.Column("desalting_efficiency_pct", sa.Numeric(5, 2)),
    )

    # ── INSTALLATION SUBTYPES (1:1 extensions of ar_installations) ──

    op.create_table(
        "ar_installation_well_pad",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("total_well_slots", sa.Integer),
        sa.Column("active_well_slots", sa.Integer),
        sa.Column("well_spacing_m", sa.Numeric(8, 2)),
    )

    op.create_table(
        "ar_installation_terminal",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("throughput_capacity_bopd", sa.Numeric(10, 2)),
        sa.Column("number_of_trains", sa.Integer),
        sa.Column("export_method", sa.String(30)),
    )

    op.create_table(
        "ar_installation_tank_farm",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("total_number_of_tanks", sa.Integer),
        sa.Column("total_storage_capacity_m3", sa.Numeric(12, 2)),
        sa.Column("api_standard", sa.String(10)),
    )

    op.create_table(
        "ar_installation_jacket_platform",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("platform_function", sa.String(30)),
        sa.Column("has_wellbay", sa.Boolean, server_default="false"),
        sa.Column("wellbay_slot_count", sa.Integer),
        sa.Column("bridge_connected_to", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_installations.id")),
    )

    op.create_table(
        "ar_installation_buoy",
        sa.Column("id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("buoy_type", sa.String(20)),
        sa.Column("design_tonnage_dwt", sa.Numeric(10, 2)),
        sa.Column("max_flow_rate_bph", sa.Numeric(10, 2)),
    )


def downgrade() -> None:
    # Drop in reverse dependency order
    tables = [
        # Installation subtypes
        "ar_installation_buoy",
        "ar_installation_jacket_platform",
        "ar_installation_tank_farm",
        "ar_installation_terminal",
        "ar_installation_well_pad",
        # Separator desalter details
        "ar_separator_desalter_details",
        # Process filters
        "ar_process_filters",
        # Utility systems
        "ar_drainage_systems",
        "ar_cooling_water_systems",
        "ar_sewage_treatment_systems",
        "ar_potable_water_systems",
        # Buildings & structural
        "ar_structural_elements",
        "ar_buildings",
        # Corrosion protection
        "ar_cathodic_protection_systems",
        # Marine / loading / survival
        "ar_survival_craft",
        "ar_mooring_systems",
        "ar_marine_loading_arms",
        # Subsea equipment
        "ar_subsea_control_systems",
        "ar_risers",
        "ar_subsea_plem_plet",
        "ar_subsea_umbilicals",
        "ar_subsea_christmas_trees",
        # Downhole children first, then parent
        "ar_esp_assemblies",
        "ar_gas_lift_mandrels",
        "ar_downhole_completions",
        # Mechanical / process
        "ar_pig_stations",
        "ar_manifolds",
        "ar_motor_control_centers",
        "ar_switchgear",
        "ar_telecom_systems",
        "ar_ups_systems",
        "ar_hvac_units",
        "ar_hpu_units",
        "ar_fire_gas_systems",
        "ar_produced_water_treatment_units",
        "ar_gas_dehydration_units",
        "ar_chemical_injection_skids",
        "ar_fiscal_metering_skids",
        "ar_nitrogen_units",
        "ar_air_compressor_packages",
        "ar_turboexpanders",
        "ar_steam_turbines",
        "ar_fans_blowers",
        "ar_fired_heaters",
        "ar_rupture_disks",
        "ar_pressure_safety_valves",
        # Column children first, then parent
        "ar_column_sections",
        "ar_process_columns",
    ]
    for t in tables:
        op.drop_table(t)
