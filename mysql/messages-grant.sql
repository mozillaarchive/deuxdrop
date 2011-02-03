# 1) Create the database with the messages.sql file first
# B) Replace the PASSWORD with a real password (the same used for email-grant.sql)
# III) run this with `mysql -u root -p < messages-grant.sql`

GRANT INSERT ON messages.* to 'python'@'localhost' IDENTIFIED BY 'PASSWORD';
GRANT INSERT ON messages.* to 'python'@'localhost.localdomain' IDENTIFIED BY 'PASSWORD';

GRANT SELECT,UPDATE,INSERT,DELETE ON messages.* to 'node'@'localhost' IDENTIFIED BY 'PASSWORD';
GRANT SELECT,UPDATE,INSERT,DELETE ON messages.* to 'node'@'localhost.localdomain' IDENTIFIED BY 'PASSWORD';
