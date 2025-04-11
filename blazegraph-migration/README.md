The migration is manual and split into two scripts: export and import, which you must run yourself. Your node will be offline during export (several hours), but usable during import. Core nodes won’t be affected staking-wise. Import time varies based on data and hardware and can take hours to days.

After finishing both export and import processes, the check_quad_num.sh should be ran. It will return info on the outcome of the migration.
 
We recommend migrating before the 8.0.6 release, as it will add more data and increase future migration time. The process removes blazegraph.jnl and rebuilds it from exported DKG and paranet repositories — so if you have custom data, review the script and back up your journal file first.
